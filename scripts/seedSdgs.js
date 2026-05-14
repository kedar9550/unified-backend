/**
 * SDG SEED SCRIPT
 * Run this to migrate existing hardcoded SDG keywords to the database.
 * Run: node scripts/seedSdgs.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Sdg = require('../modules/SDG/Sdg.model');

const sdgData = {
  "SDG-1": {
    title: "NO POVERTY",
    keywords: [
      "Developing countries", "Basic services", "Class", "Disadvantaged",
      "Economic resources", "End poverty", "Environment", "Equality",
      "Extreme poverty", "Financial inclusion", "Income", "Income equality",
      "Microfinance", "Non- discrimination", "Poor", "Poor and vulnerable",
      "Poverty", "Poverty eradication", "Poverty line", "Quality of Life",
      "Resources", "Social protection systems /social protection", "Sustainable",
      "Third World", "Vulnerable", "Wealth distribution", "social protection",
      "health insurance", "social welfare", "welfare", "social security",
      "pension", "social policy", "unemployment", "social investment",
      "safety net", "social", "social exclusion", "inequality",
      "insurance", "retrenchment", "access", "employment"
    ],
  },
  "SDG-2": {
    title: "ZERO HUNGER",
    keywords: [
      "Agricultural Orientation index", "Agricultural productivity", "Agriculture",
      "Consume", "Crop diversity", "Crops", "End hunger", "Environment",
      "Food", "Food gap", "Food production", "Food reserves", "Food Security",
      "Genetic diversity", "Genetics", "Hunger", "Hungry people",
      "Improved nutrition", "Innovations and health", "Legumes", "Maize",
      "Malnourished", "Malnutrition", "Nutrition", "Nutritional needs",
      "Nutritious", "Poverty", "Produce", "Productivity", "Quality of life",
      "Resilient Agriculture", "Rural infrastructure", "Small-scale food producers",
      "Stunted growth", "Stunting", "Sufficient food", "Sustainable",
      "Sustainable agriculture", "Sustainable food production", "Trade diversity",
      "Trade restrictions", "Under nourished", "Wasting", "World's hungry",
      "Undernourished", "biological control", "domestication", "organic systems",
      "agroforestry", "biocontrol", "agricultural", "undernutrition",
      "smallholder", "organic", "natural enemies", "precision agriculture",
      "enemies", "intercropping", "precision", "crop"
    ],
  },
  "SDG-3": {
    title: "GOOD HEALTH AND WELL-BEING",
    keywords: [
      "Access to clean water and sanitation", "Affordable medicines", "AIDS",
      "Air contamination", "Air pollution", "Alcohol abuse", "Antenatal care",
      "Antiretroviral", "Antiretroviral therapy", "Biomedical", "Bodily autonomy",
      "Child deaths", "Contraceptive use", "Death rate", "Dental",
      "Disability and family support", "Disability and inclusion",
      "Disability and politics of location", "Diseases", "Family planning",
      "Health", "Health in resource-constrained settings", "Health worker",
      "Density", "Healthy", "Healthy lives", "Hepatitis", "HIV",
      "Improving mortality", "Increasing life expectancy", "Indigenous",
      "Infected", "International health policy", "International health regulations",
      "Malaria", "Maternal mortality", "Measles", "Medical", "Mental health",
      "Mortality", "Mortality rate", "Narcotic drug abuse", "Neonatal mortality",
      "Polio", "Premature mortality", "Preventable deaths", "cancer", "stroke",
      "diabetes", "obesity", "suicide", "asthma", "carcinoma", "tuberculosis",
      "pneumonia", "anticancer", "influenza", "heart disease", "leukemia",
      "strokes", "cancers", "melanoma"
    ],
  },
  "SDG-4": {
    title: "QUALITY EDUCATION",
    keywords: [
      "Access to education", "Basic education", "Basic literacy",
      "Basic literacy skills", "Cultural diversity", "Disability",
      "Disability and education", "Early childhood", "Early childhood development",
      "Education", "Education for sustainability", "Education in development",
      "Enrolment", "Equal access", "Equal education", "Equitable education",
      "Gender disparities in education", "Gender disparity", "Gender equality",
      "Gender equity", "Gender sensitive", "Global citizenship",
      "Global education", "Inclusion and education", "Inclusive", "Innovation",
      "International cooperation", "Learning opportunities", "trainees",
      "apprenticeship", "professional training", "educational needs",
      "distance learning", "educational strategies", "school environment",
      "trainee", "professional education", "special education", "reading",
      "academic performance", "distance education", "education needs",
      "school buildings", "practical training", "education reform",
      "educational", "humanistic"
    ],
  },
  "SDG-5": {
    title: "GENDER EQUALITY",
    keywords: [
      "Gender equality", "Women and girls", "Female", "Empowerment",
      "Discrimination against women", "Violence against women", "Child marriage",
      "Forced marriage", "Genital mutilation", "Unpaid care", "Domestic work",
      "Leadership", "Decision-making", "Sexual and reproductive health",
      "Reproductive rights", "Economic resources for women", "Ownership of land",
      "Technology for women's empowerment", "Gender policy", "Women's rights",
      "Gender disparities", "Gender disparity", "Gender equity", "Gender sensitive",
      "Feminism", "Maternal health", "Women's participation", "Equal pay"
    ],
  },
  "SDG-6": {
    title: "CLEAN WATER AND SANITATION",
    keywords: [
      "Affordable drinking water", "Aquifer", "Cities", "Clean water",
      "Contaminated", "Defecation", "Desalination", "Diarrhoeal diseases",
      "Drought", "Dumping", "Ecosystem protection", "Ecosystem restoration",
      "Equitable sanitation", "Floods", "Fresh water", "Hydropower",
      "Hygiene", "Improving water", "Inadequate water", "Inadequate water supply",
      "Infrastructure", "Irrigation", "Lakes", "Latrines", "Open defecation",
      "Pollution", "Recycled water", "Reuse", "River basins", "Rivers", "Safe",
      "drinking water", "Sanitation", "Sanitation and hygiene",
      "Sanitation management", "Sewerage", "Sustainable water management",
      "Sustainable withdrawals", "Third world", "Toilets", "Untreated wastewater",
      "Urban", "Waste", "Wastewater", "Wastewater treatment", "Accessible water",
      "water management", "water quality", "waste water", "activated sludge",
      "water pollution", "wastewaters", "water", "water treatment",
      "contaminated water", "sewage treatment", "drinking", "groundwater",
      "restoration", "effluent"
    ],
  },
  "SDG-7": {
    title: "AFFORDABLE AND CLEAN ENERGY",
    keywords: [
      "Affordable energy", "Alternative energy", "Animal waste", "Battery",
      "Carbon", "Charcoal", "Clean energy", "Clean energy technology",
      "Clean fuel technology", "Clean fuels", "Cleaner fossil fuel technology",
      "Climate goal", "Coal", "Electricity", "Electricity infrastructure",
      "Emissions", "Energy", "Energy efficiency", "Energy infrastructure",
      "Energy research", "Energy technology", "Fossil-fuel", "Green economy",
      "Greenhouse gas", "Greenhouse gas emissions", "Hydroelectric",
      "Low carbon", "Modern electricity", "Modern energy", "Reliable energy",
      "Renewable", "Renewable energy", "Renewable power", "Solar",
      "Solar energy", "Solar power", "Sustainable energy",
      "Sustainable energy services", "Sustainable power", "Vehicles",
      "Wave", "Wind", "Wind power", "Wind turbine", "Wood", "photovoltaic",
      "biodiesel", "internet things", "biofuel", "energy efficient",
      "fuel cell", "solar cells", "hydropower", "geothermal", "biofuels",
      "fuel cells", "bioenergy", "things", "iter", "energy saving",
      "hydrogen evolution"
    ],
  },
  "SDG-8": {
    title: "DECENT WORK AND ECONOMIC GROWTH",
    keywords: [
      "Aid for trade", "Banking", "Child labour", "Child soldiers",
      "Creativity and innovation", "Culture", "Decent work", "Decent work for all",
      "Development oriented policy", "Economic growth", "Economic productivity",
      "Economy", "Enterprises", "Entrepreneurship", "Equal pay", "Finance",
      "Financial services", "Forced labour", "GDP growth", "Global resource efficiency",
      "Global trade", "Gross domestic product growth", "Human trafficking",
      "Inclusive economic growth", "Innovation", "Insurance", "Job creation",
      "Jobs", "Labour market", "Labour rights", "Micro finance", "Migrant workers",
      "Modern slavery", "Poverty eradication", "Poverty line",
      "Productive employment", "Productivity", "Public policy", "Quality jobs",
      "Quality of life", "Resource efficiency", "Safe work", "Secure work",
      "Slavery", "Social policies", "human capital", "labor market",
      "crop productivity", "economic development", "occupational safety",
      "environmental economic", "sustainable development", "soil productivity",
      "regional development", "regional growth", "economies scale", "job search",
      "industrial policy", "labor markets", "climate change",
      "technological progress", "environmental impact"
    ],
  },
  "SDG-9": {
    title: "INDUSTRY, INNOVATION AND INFRASTRUCTURE",
    keywords: [
      "Access to the internet", "Affordable access", "Affordable credit",
      "Clean technologies", "Cooperation", "Data banks", "Economic development",
      "Electrical power", "Energy", "Enterprises", "Environmentally sound technologies",
      "Financial services", "ICT", "Infrastructure", "Industrial diversification",
      "Industrialisation", "Information and communication technology",
      "Infrastructure", "Innovation", "Internet access", "Irrigation",
      "Knowledge in education for all", "Mobile networks in developing countries",
      "National", "Security", "Network infrastructure", "Phone service",
      "Public policy", "Quality of life", "Regional infrastructure",
      "Research", "Resilient infrastructure", "Resource use efficiency",
      "Roads", "Sanitation", "Scientific research", "Society",
      "Sustainable industrialization", "Sustainable infrastructure",
      "Technological capabilities", "Technology", "Trade", "Transborder infrastructure",
      "Transport", "Value chains", "Value chains and markets", "Water infrastructure",
      "Water resources", "manufacturing", "industrial", "microfabrication",
      "prototyping", "industry", "innovative", "micromachining",
      "nanofabrication", "mobile users", "research development",
      "rapid prototyping", "access internet", "digital divide",
      "manufacturing technology", "infrastructure projects", "sustainable",
      "employment"
    ],
  },
  "SDG-10": {
    title: "REDUCED INEQUALITIES",
    keywords: [
      "Affordable housing", "Age", "Ageism", "Business", "Children", "Culture",
      "Developing countries", "Developing states", "Development assistance",
      "Disabilities", "Discrimination", "Discriminatory", "Economy", "Education",
      "Empower", "Equal opportunity", "Equality", "Equity", "Ethnicity",
      "Financial assistance", "Foreign aid", "Foreign investment", "Gender",
      "Global financial markets", "Health", "Homelessness", "Homophobia",
      "Human rights", "Inclusion", "Income growth", "Income inequality",
      "Indigenous", "Inequalities", "Inequality", "Migrant remittance",
      "Migration", "Population growth", "Poverty", "Public policy",
      "Quality of life", "Race", "Racisim", "Reduce inequalities", "Religion",
      "Rural", "Sex", "Sexism", "Social protection", "Society",
      "Vulnerable nations", "World trade", "medicaid", "social justice",
      "financial crisis", "social integration", "social inclusion", "disparities",
      "social mobility", "health disparities", "social inequality",
      "financial stability", "social stratification", "social inequalities",
      "migrant workers", "health inequalities", "students autism", "asylum",
      "remittances"
    ],
  },
  "SDG-11": {
    title: "SUSTAINABLE CITIES AND COMMUNITIES",
    keywords: [
      "Adaptable", "Adaptation", "Affordable housing", "Air pollution",
      "Air quality", "Cities", "Climate change", "Community", "Cultural heritage",
      "Decentralisation", "Development planning", "Disaster management",
      "Disaster risk reduction", "Disaster Strategy", "Disasters",
      "Fine particulate matter", "Green spaces", "Heritage", "Housing",
      "Human settlements", "Impact of cities", "Inadequate housing",
      "Informal settlements", "Infrastructure", "Land", "Land consumption",
      "Local materials", "Mitigation", "Natural disasters", "Natural heritage",
      "Overcrowding", "Pollution", "Population", "Population growth",
      "Public spaces", "Public transport", "Resilient", "Resilient buildings",
      "Resource efficiency", "Resource needs", "Risk reduction strategy",
      "Road safety", "Safe cities", "Shanty", "Slums", "Smart cities",
      "Solid waste", "Suburban", "Sustainable", "Sustainable building/s",
      "Sustainable cities/city", "Sustainable communities",
      "Sustainable urbanisation", "Town planning", "Transport",
      "Transport systems", "Urban", "Urban development", "Urban planning",
      "Urban sustainability", "Urbanisation", "Waste", "Waste generation",
      "Waste management", "road network", "earthquake",
      "intelligent transportation", "city", "public transportation",
      "road networks", "housing market", "municipal", "flood"
    ],
  },
  "SDG-12": {
    title: "RESPONSIBLE CONSUMPTION AND PRODUCTION",
    keywords: [
      "Capitalism", "Cars", "Circular economy", "Commercial enterprises",
      "Consumer levels", "Consumerism", "Consumption", "Deep decarbonisation",
      "Ecological", "Efficient use of resources", "Energy", "Energy consumption",
      "Energy efficiency", "Energy use", "Food", "Food losses", "Food supply",
      "Food waste", "Fossil fuel subsidies", "Future proof", "Global food waste",
      "Greenhouse gasses", "Harvest losses", "Life cycle", "Market distortions",
      "Materialism", "Materials goods", "Monitoring sustainable development",
      "Natural resources", "Obsolescence", "Overconsumption", "Production",
      "Recycle", "Recycling", "Reduce waste generation", "Reduction",
      "Renewable", "Resource efficiency", "Responsible production chains",
      "Retail", "Retail industry", "Reuse", "Sustainable", "Sustainable consumption",
      "Sustainable management", "Sustainable practices", "Sustainable production",
      "Sustainable public procurement", "Sustainable resource use",
      "Sustainable supply chain", "Sustainable tourism", "Vehicles",
      "Waste", "Wasteful consumption", "Water", "Water pollution", "Water supply",
      "composting", "waste disposal", "vermicompost", "food preservation",
      "hazardous waste", "tourism", "waste management", "recycled",
      "landfill", "waste treatment", "tourism development", "natural resource",
      "environmental attitudes", "cycle analysis", "sustainability assessment",
      "nuclear waste"
    ],
  },
  "SDG-13": {
    title: "CLIMATE ACTION",
    keywords: [
      "Average global temperature", "Carbon", "Carbon dioxide",
      "Changing weather patterns", "Climate", "Climate action",
      "Climate adaptation", "Climate and gender", "Climate and infectious disease",
      "Climate and politics", "Climate change", "Climate change management",
      "Climate change planning", "Climate change policy", "Climate early warning",
      "Climate hazards", "Climate impact", "Climate mitigation",
      "Climate refugees", "Climate related hazards", "Climate resilience",
      "CO2 capture", "CO2 conversion", "COP 21", "COP 22", "Ecosystems",
      "Emissions", "Extreme weather", "Extreme weather events",
      "Global mean temperature", "Global temperature", "Global warming",
      "Greenhouse gas", "Greenhouse gas emissions", "Greenhouse gases",
      "Ice loss", "Low-carbon economy", "Natural disasters", "Natural systems",
      "Ocean warming", "Paris Agreement", "Pollution", "Renewable",
      "Sea level rise/ Rising sea / Rising sea level", "Temperature", "co2",
      "co2 emissions", "climate warming", "global climate", "emission",
      "co2 emission", "warming", "carbon footprint", "gas emissions",
      "carbon conversion", "capture", "greenhouse", "ipcc"
    ],
  },
  "SDG-14": {
    title: "LIFE BELOW WATER",
    keywords: [
      "Artisanal fishers", "Biodiversity", "Carbon dioxide", "Coastal biodiversity",
      "Coastal ecosystems", "Coastal habitats", "Coastal parks",
      "Coastal resources", "Coastlines", "Conserve", "Conserve oceans",
      "Coral bleaching", "Coral reef", "Ecosystem management", "Fish species",
      "Fish stocks", "Fish stocks and Fisheries management", "Fisheries",
      "Fishers", "Fishing", "Fishing practices", "Global warming",
      "Illegal fishing", "Kelp", "Law of the Sea", "Marine", "Marine areas",
      "Marine biodiversity", "Marine ecosystems", "Marine fisheries",
      "Marine Parks", "Marine pollution", "Marine resources", "Ocean",
      "Ocean acidification", "Ocean temperature", "Oceanography", "Oceans",
      "Overfishing", "Productive oceans", "Protected areas", "Sea grasses",
      "Seas", "Sustainable ecosystems", "Unregulated fishing",
      "Water resources and policy", "oil spill", "conservation", "coastal",
      "spill", "phosphorus removal", "sea", "bloom", "blooms",
      "fisheries management", "aquaculture", "hydrocarbons", "oil spills",
      "eutrophication", "coast", "spills", "contamination", "pollution"
    ],
  },
  "SDG-15": {
    title: "LIFE ON LAND",
    keywords: [
      "Afforestation", "Agriculture", "Animals", "Arable land", "Bees",
      "Biodiversity", "Biodiversity loss", "Conservation", "Deforestation",
      "Desertification", "Drought", "Dry lands", "Ecosystem",
      "Ecosystem restoration", "Ecosystems", "Extinct", "Extinct species",
      "Extinction", "Forest", "Forest management", "Forests", "Genetic resources",
      "Illegal wildlife products", "Illicit trafficking", "Indigenous",
      "Indigenous populations", "Invasive alien species", "Land conservation",
      "Land degradation", "Land loss", "Land use and sustainability",
      "Manage forests", "Managed forests", "Micro-organisms", "Permaculture",
      "Plants", "Poaching", "Poverty", "Protected fauna", "Protected flora",
      "Protected species", "Reforestation", "Soil", "Soil degradation",
      "Species", "Strategic plan for biodiversity", "Terrestrial ecosystems",
      "Threatened species", "Tree", "Tree species", "Wetlands",
      "bioremediation", "phytoremediation", "invasive", "endangered",
      "soil conservation", "revegetation", "restoration", "predator prey",
      "endangered species", "valuation", "environmental conservation",
      "nature conservation", "invasive weed", "ecosystem management"
    ],
  },
  "SDG-16": {
    title: "PEACE, JUSTICE AND STRONG INSTITUTIONS",
    keywords: [
      "Abuse", "Accountability", "Accountable institutions", "Arbitrary detention",
      "Arms", "Arms trafficking", "Birth registration", "Bribery",
      "Combat terrorism", "Conflict resolution", "Conflicts", "Corruption",
      "Discrimination", "Education", "Enforced disappearance", "Equal access",
      "Equity", "Exploitation", "Flow of arms", "Freedom", "Geography of poverty",
      "Governance", "Hate crime", "Human rights", "Human trafficking",
      "Illegal arms", "Illicit financial flows", "Inclusion",
      "Inclusive institutions", "Inclusive societies/society", "Institutions",
      "Internally displaced", "Judiciary", "Justice", "Justice for all",
      "Legal identity", "National Security", "Non-violence", "Organized crime",
      "Paris principles", "Peace", "Peaceful societies", "Physical abuse",
      "Police", "Prevent violence", "community engagement",
      "community participation", "child welfare", "rule law", "mafia",
      "participatory", "homicide", "community involvement", "public participation",
      "participatory research", "collaborative decision", "public engagement",
      "human right", "child protection", "infanticide", "participatory approach"
    ],
  },
  "SDG-17": {
    title: "PARTNERSHIPS FOR THE GOALS",
    keywords: [
      "Capacity building", "Civil society partnerships", "Communication technologies",
      "Debt sustainability", "Development assistance", "Disaggregated data",
      "Doha Development Agenda", "Entrepreneurship",
      "Environmentally sound technologies", "Foreign direct investments",
      "Fostering innovation", "Free trade",
      "Fundamental principles of official statistics", "Global partnership",
      "Global partnership for sustainable development", "Global stability",
      "International aid", "International cooperation",
      "International population and housing census", "International support",
      "International support for developing countries", "Knowledge sharing",
      "Multi-stakeholder partnerships", "Poverty eradication",
      "Public-private partnerships", "Science cooperation agreements",
      "Technology cooperation agreements", "Technology transfer",
      "Weighted tariff average", "Women entrepreneurs", "World Trade Organization"
    ],
  },
};

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.UnifiedDb);
        console.log('MongoDB connected');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
};

const seedSdgs = async () => {
    console.log('\nSeeding SDGs...');
    
    try {
        await connectDB();
        
        // Clear existing SDGs
        await Sdg.deleteMany({});
        console.log('  ✓ Cleared existing SDGs');
        
        const sdgsToInsert = Object.entries(sdgData).map(([number, data]) => ({
            sdgNumber: number,
            sdgTitle: data.title,
            keywords: data.keywords
        }));
        
        await Sdg.insertMany(sdgsToInsert);
        console.log(`  ✓ Inserted ${sdgsToInsert.length} SDGs`);
        
        console.log('\n✅ SDG Seeding completed successfully!');
    } catch (err) {
        console.error('Seeding failed:', err);
    } finally {
        await mongoose.disconnect();
    }
};

seedSdgs();
