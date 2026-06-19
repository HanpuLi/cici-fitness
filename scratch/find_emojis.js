const fs = require('fs');
const path = require('path');

const files = [
    'Index.html',
    'app.js',
    'core.js',
    'dev.js',
    'style.css',
    'manifest.json',
    'scratch/smoke_test.js',
    'scratch/dev_smoke_test.js'
];

const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

files.forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
        const matches = line.match(emojiRegex);
        if (matches) {
            console.log(`${file}:${idx + 1}: ${line.trim()} (Matches: ${matches.join(', ')})`);
        }
    });
});
