const { execSync } = require('child_process');
try {
  const out = execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV', { encoding: 'utf8' });
  for (const l of out.split('\n').filter(l => l.includes('node.exe'))) {
    const pid = l.split('","')[1];
    if (pid) { try { execSync(`taskkill /PID ${pid} /F`); } catch (e) {} }
  }
} catch (e) {}
console.log('done');
