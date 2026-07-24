const fs = require('fs');
const path = require('path');

const modulesDir = path.join(__dirname, '../modules');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if (file.endsWith('.js')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walk(modulesDir);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Find all authorize(...) calls
    const authorizeRegex = /authorize\(([^)]+)\)/g;
    
    let modified = false;
    content = content.replace(authorizeRegex, (match, args) => {
        // args looks like: "'ADMIN', 'FEEDBACK COORDINATOR', 'UNIVERSITY'"
        // We want to replace spaces with underscores ONLY inside the quotes.
        
        // This splits by commas, then replaces spaces in each string
        const newArgs = args.split(',').map(arg => {
            return arg.replace(/['"]([^'"]+)['"]/g, (m, str) => {
                // If it contains a space, replace with underscore
                if (str.includes(' ')) {
                    return m[0] + str.toUpperCase().replace(/ /g, '_') + m[m.length-1];
                }
                return m;
            });
        }).join(',');
        
        if (args !== newArgs) {
            modified = true;
        }
        return `authorize(${newArgs})`;
    });

    if (modified) {
        console.log(`Updated authorize strings in ${file}`);
        fs.writeFileSync(file, content, 'utf8');
    }
});

console.log("Done updating authorize keys.");
