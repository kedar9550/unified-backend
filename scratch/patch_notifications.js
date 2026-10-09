const fs = require('fs');
const path = require('path');

const controllers = [
    'Journal/Journal.controller.js',
    'BookChapter/BookChapter.controller.js',
    'Conference/Conference.controller.js',
    'Consultancy/Consultancy.controller.js',
    'FundedProject/FundedProject.controller.js',
    'Patent/Patent.controller.js',
    'Textbook/Textbook.controller.js',
    'Contribution/Contribution.controller.js',
    'PhdScholar/PhdScholar.controller.js',
    'NovelProduct/NovelProduct.controller.js'
];

const basePath = path.join(__dirname, '../modules');

for (const ctrl of controllers) {
    const fullPath = path.join(basePath, ctrl);
    if (!fs.existsSync(fullPath)) continue;

    let content = fs.readFileSync(fullPath, 'utf8');
    const moduleName = ctrl.split('/')[0].replace(/([A-Z])/g, ' $1').trim();
    
    const patchAction = (content, actionName, actionBy) => {
        const actionIdx = content.indexOf(`exports.${actionName}`);
        if (actionIdx === -1) return content;
        
        const catchIdx = content.indexOf('catch', actionIdx);
        const subContent = content.substring(actionIdx, catchIdx);
        
        const resJsonMatch = /res\.json\(\{\s*success:\s*true,\s*data:\s*([a-zA-Z0-9_]+)\s*\}\);/.exec(subContent);
        
        if (resJsonMatch) {
            const varName = resJsonMatch[1];
            
            if (subContent.includes(`NotificationService.sendNotification`)) {
                return content;
            }

            let notifCode = '';
            if (actionName === 'hodAction') {
                notifCode = `
        try {
            const NotificationService = require('../../modules/notification/notification.service');
            const targetFacultyId = ${varName}.facultyId || ${varName}.facultyId?._id;
            
            if (targetFacultyId) {
                await NotificationService.sendNotification({
                    recipientId: targetFacultyId,
                    senderId: req.user.userId,
                    module: 'Research',
                    type: action === 'Approve' ? 'SUCCESS' : 'ERROR',
                    title: \`${moduleName} \${action}d by ${actionBy}\`,
                    message: \`Your ${moduleName} has been \${action.toLowerCase()}d by ${actionBy}.\`,
                    link: '/faculty/my-research-metrics'
                });
            }

            if (action === 'Approve') {
                const Role = require('../../modules/role/role.model');
                const UserAppRole = require('../../modules/userAppRole/userAppRole.model');
                const rndRoles = await Role.find({ key: { $in: ['RESEARCH_DEAN', 'RESEARCH_COORDINATOR'] } });
                const rndRoleIds = rndRoles.map(r => r._id);
                const rndAdmins = await UserAppRole.find({ role: { $in: rndRoleIds } }).distinct('userId');
                
                for (const adminId of rndAdmins) {
                    await NotificationService.sendNotification({
                        recipientId: adminId,
                        senderId: req.user.userId,
                        module: 'Research',
                        type: 'INFO',
                        title: \`New ${moduleName} for R&D Approval\`,
                        message: \`A ${moduleName} has been approved by HOD and is pending your approval.\`,
                        link: '/research-dean/approvals'
                    });
                }
            }
        } catch (notifErr) {
            console.error("Failed to send notification:", notifErr);
        }
`;
            } else {
                notifCode = `
        try {
            const NotificationService = require('../../modules/notification/notification.service');
            const targetFacultyId = ${varName}.facultyId || ${varName}.facultyId?._id;
            
            if (targetFacultyId) {
                await NotificationService.sendNotification({
                    recipientId: targetFacultyId,
                    senderId: req.user.userId,
                    module: 'Research',
                    type: action === 'Approve' ? 'SUCCESS' : 'ERROR',
                    title: \`${moduleName} \${action}d by ${actionBy}\`,
                    message: \`Your ${moduleName} has been \${action.toLowerCase()}d by ${actionBy}.\`,
                    link: '/faculty/my-research-metrics'
                });
            }
        } catch (notifErr) {
            console.error("Failed to send notification:", notifErr);
        }
`;
            }
            
            const replacedSubContent = subContent.replace(resJsonMatch[0], notifCode + '\n        ' + resJsonMatch[0]);
            content = content.substring(0, actionIdx) + replacedSubContent + content.substring(catchIdx);
        }
        return content;
    };

    content = patchAction(content, 'hodAction', 'HOD');
    content = patchAction(content, 'rndAction', 'R&D');

    fs.writeFileSync(fullPath, content);
    console.log(`Patched ${ctrl}`);
}
