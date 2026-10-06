const fs = require('fs');

const models = [
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

for(const p of models) {
    if (fs.existsSync(p)) {
        let content = fs.readFileSync(p, 'utf8');
        content = content.replace(/Pending at HOD/g, "Pending");
        content = content.replace(/Rejected by HOD/g, "Rejected");
        fs.writeFileSync(p, content);
        console.log('Updated model', p);
    }
}

const controllers = [
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

for(const p of controllers) {
    if (fs.existsSync(p)) {
        let content = fs.readFileSync(p, 'utf8');
        content = content.replace(/Pending at HOD/g, "Pending");
        content = content.replace(/Rejected by HOD/g, "Rejected");
        fs.writeFileSync(p, content);
        console.log('Updated controller', p);
    }
}
