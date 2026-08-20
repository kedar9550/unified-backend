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

            // Parse the stdout to extract the number of skipped rows and errors
            let skips = 0;
            let errs = 0;
            let skipReasons = new Set();
            
            if (stdout) {
                const lines = stdout.split('\n');
                lines.forEach(line => {
                    const skipMatch = line.match(/Skipping row \d+:\s*(.*)/i);
                    if (skipMatch) {
                        skips++;
                        let reason = skipMatch[1].trim();
                        // Group reasons by removing specific IDs
                        reason = reason.replace(/ID \S+ not found/gi, "Faculty not found");
                        reason = reason.replace(/Year \S+ not found/gi, "Academic Year not found");
                        skipReasons.add(reason);
                    }
                    if (line.toLowerCase().includes('error processing row')) {
                        errs++;
                    }
                });
            }

            let message = `${type} data uploaded and processed successfully!`;
            
            if (skips > 0 || errs > 0) {
                message = `${type} upload completed with issues. Skipped: ${skips}, Errors: ${errs}.`;
                if (skipReasons.size > 0) {
                    message += ` Skip Reasons: ${Array.from(skipReasons).join('; ')}`;
                }
            } else if (stdout && stdout.toLowerCase().includes('error')) {
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
