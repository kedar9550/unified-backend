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

            // Parse the stdout and stderr to extract the number of skipped rows and errors
            let skips = 0;
            let errs = 0;
            let skipReasons = new Set();
            let errorReasons = new Set();
            
            const combinedOutput = (stdout || '') + '\n' + (stderr || '');
            if (combinedOutput) {
                const lines = combinedOutput.split('\n');
                lines.forEach(line => {
                    const skipMatch = line.match(/Skipping row \d+:\s*(.*)/i);
                    const errorMatch = line.match(/Error processing row \d+:\s*(.*)/i);
                    
                    if (skipMatch) {
                        skips++;
                        let reason = skipMatch[1].trim();
                        // Group reasons by removing specific IDs
                        reason = reason.replace(/ID \S+ not found/gi, "Faculty not found");
                        reason = reason.replace(/Year \S+ not found/gi, "Academic Year not found");
                        skipReasons.add(reason);
                    } else if (errorMatch) {
                        errs++;
                        let reason = errorMatch[1].trim();
                        if (reason.includes('E11000 duplicate key error')) {
                            if (reason.includes('isbn')) {
                                reason = 'Duplicate ISBN found';
                            } else if (reason.includes('title')) {
                                reason = 'Duplicate Title found';
                            } else {
                                reason = 'Duplicate Entry found';
                            }
                        } else if (reason === '') {
                            reason = 'Unknown processing error';
                        }
                        errorReasons.add(reason);
                    } else if (line.toLowerCase().includes('error processing row')) {
                        errs++;
                    }
                });
            }

            let message = `${type} data uploaded and processed successfully!`;
            let isSuccess = true;
            
            if (skips > 0 || errs > 0) {
                isSuccess = false;
                message = `${type} upload completed with issues. Skipped: ${skips}, Errors: ${errs}.`;
                
                let combinedReasons = [];
                if (skipReasons.size > 0) combinedReasons.push(`Skips: ${Array.from(skipReasons).join(', ')}`);
                if (errorReasons.size > 0) combinedReasons.push(`Errors: ${Array.from(errorReasons).join(', ')}`);
                
                if (combinedReasons.length > 0) {
                    message += ` Details: ${combinedReasons.join(' | ')}`;
                }
            } else if (stdout && stdout.toLowerCase().includes('error')) {
                isSuccess = false;
                message = `${type} upload had some errors. Check the server logs.`;
            }

            res.status(isSuccess ? 200 : 400).json({
                success: isSuccess,
                message: message,
                logs: stdout
            });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error processing upload' });
    }
};
