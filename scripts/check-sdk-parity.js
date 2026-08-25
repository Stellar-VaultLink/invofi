const fs = require('fs');
const path = require('path');

const FRONTEND_SRC_DIR = path.join(__dirname, '..', 'invofi', 'apps', 'frontend', 'src');
const EXCLUDED_FILES = [
  path.join(FRONTEND_SRC_DIR, 'lib', 'contract.ts')
];

const PARITY_REGEX = /contract\.invoke|createInvofiClient|new\s+Contract\b/;
const EXCEPTION_COMMENT = '// sdk-parity-exception';

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) {
    return;
  }
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(path.join(dir, f));
    }
  }
}

let hasError = false;

walkDir(FRONTEND_SRC_DIR, (filePath) => {
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) {
    return;
  }

  // Normalize paths for comparison (Windows/Unix)
  const isExcluded = EXCLUDED_FILES.some(ex => path.resolve(ex) === path.resolve(filePath));
  if (isExcluded) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (PARITY_REGEX.test(line) && !line.includes(EXCEPTION_COMMENT)) {
      console.error(`Error: SDK parity violation found at ${filePath}:${index + 1}`);
      console.error(`  > ${line.trim()}`);
      hasError = true;
    }
  });
});

if (hasError) {
  process.exit(1);
} else {
  console.log('SDK parity check passed. No raw contract usage found in frontend.');
  process.exit(0);
}
