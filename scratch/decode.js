const fs = require('fs');
const content = fs.readFileSync('core.js', 'utf-8');
const match = content.match(/const EX_SUB_DESC = (\{[\s\S]*?\n\});/);
if (match) {
  const obj = eval('(' + match[1] + ')');
  for (let key in obj) {
    console.log(`\n=== 动作: ${key} ===`);
    if (obj[key].name) console.log(`【私密名称】: ${Buffer.from(obj[key].name, 'base64').toString('utf8')}`);
    if (obj[key].steps) {
      console.log(`【私密步骤】:`);
      obj[key].steps.forEach((s, i) => console.log(`  ${i+1}. ${Buffer.from(s, 'base64').toString('utf8')}`));
    }
    if (obj[key].tips) {
      console.log(`【私密提示】:`);
      obj[key].tips.forEach(t => console.log(`  - ${Buffer.from(t, 'base64').toString('utf8')}`));
    }
  }
}
