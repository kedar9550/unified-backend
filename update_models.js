const fs = require('fs');
const paths = [
    'modules/Journal/Journal.model.js',
    'modules/Conference/Conference.model.js',
    'modules/BookChapter/BookChapter.model.js',
    'modules/Textbook/Textbook.model.js',
    'modules/Patent/Patent.model.js',
    'modules/FundedProject/FundedProject.model.js',
    'modules/Consultancy/Consultancy.model.js',
    'modules/NovelProduct/NovelProduct.model.js',
    'modules/PhdScholar/PhdApplication.model.js'
];
for(const p of paths) {
    if (fs.existsSync(p)) {
        let content = fs.readFileSync(p, 'utf8');
        content = content.replace(/enum:\s*\['Pending at R&D',\s*'Approved',\s*'Rejected by R&D'\]/g, "enum: ['Pending', 'Rejected', 'Pending at R&D', 'Approved', 'Rejected by R&D']");
        
        // Also update default: 'Pending at R&D' to default: 'Pending at HOD'
        content = content.replace(/default:\s*'Pending at R&D'/g, "default: 'Pending'");

        fs.writeFileSync(p, content);
        console.log('Updated', p);
    } else {
        console.log('Not found:', p);
    }
}
