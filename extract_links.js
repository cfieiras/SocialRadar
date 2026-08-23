const fs = require('fs');
const html = fs.readFileSync('C:/Users/Azrael/.gemini/antigravity/brain/d6433047-6300-46e3-bcf8-3cc7a18676f4/.system_generated/steps/6/output.txt', 'utf8');
const regex = /<a[^>]+>/g;
let match;
const links = new Set();
while ((match = regex.exec(html)) !== null) {
  links.add(match[0]);
}
console.log(Array.from(links).slice(0, 50).join('\n'));
