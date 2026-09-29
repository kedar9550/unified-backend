const fs = require('fs');
const glob = require('glob');
const paths = [
    'modules/Journal/Journal.controller.js',
    'modules/Conference/Conference.controller.js',
    'modules/BookChapter/BookChapter.controller.js',
    'modules/Textbook/Textbook.controller.js',
    'modules/Patent/Patent.controller.js',
    'modules/FundedProject/FundedProject.controller.js',
    'modules/Consultancy/Consultancy.controller.js',
    'modules/NovelProduct/NovelProduct.controller.js',
    'modules/PhdScholar/PhdScholar.controller.js'
];
for(const p of paths) {
    if (fs.existsSync(p)) {
        let content = fs.readFileSync(p, 'utf8');
        
        // Initial submission
        content = content.replace(/let finalStatus = 'Pending at R&D';/g, "let finalStatus = 'Pending';");
        
        // Resubmission (usually updates journal.status or conference.status)
        content = content.replace(/\.status = 'Pending at R&D'; \/\/ Resubmit/g, ".status = 'Pending'; // Resubmit");
        content = content.replace(/status = 'Pending at R&D'; \/\/ Resubmit/g, "status = 'Pending'; // Resubmit");

        fs.writeFileSync(p, content);
        console.log('Updated', p);
    } else {
        console.log('Not found:', p);
    }
}
