const path = require('path');
const { exec } = require('child_process');

exports.handleResearchUpload = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const type = req.params.type;
        
        // Map the type to the respective backend script filename
        const scriptMap = {
            'bookchapters': 'upload_bookchapter.js',
            'conferences': 'upload_conference.js',
            'journals': 'upload_journals.js',
            'novelproducts': 'upload_novelproduct.js',
            'patents': 'upload_patent.js',
            'phdscholars': 'upload_phdscholars.js',
            'projects_consultancy': 'upload_project_consultancy.js',
            'textbooks': 'upload_textbooks.js'
        };

        const targetScript = scriptMap[type];
        if (!targetScript) {
            return res.status(400).json({ success: false, message: 'Invalid category type' });
        }

        const scriptPath = path.join(__dirname, '../../scripts/research_uploads', targetScript);
        
        // Execute the script using node
        console.log(`Triggering upload script for ${type} at ${scriptPath}`);
        
        exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing script: ${error.message}`);
                console.error(`stderr: ${stderr}`);
                return res.status(500).json({ 
                    success: false, 
                    message: `Upload failed during processing. Check logs.`,
                    details: error.message
                });
            }

            // Optional: Count the number of rows processed from stdout
            let message = `${type} data uploaded and processed successfully!`;
            
            // Check if there are any specific errors logged by the script
            if (stdout && stdout.toLowerCase().includes('error')) {
                message += " (Note: Some rows may have had errors. Check the server logs).";
            }

            res.status(200).json({
                success: true,
                message: message,
                logs: stdout
            });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error processing upload' });
    }
};
