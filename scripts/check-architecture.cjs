const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const posix = path.posix;
const offline = file => /^src\/(ai|ml|storage|scheduler)\//.test(file);
const cloud = file => /^src\/(cloud|sync)\//.test(file);
const externalNetwork = /^(?:node:)?(?:https?|net|tls)$|^(?:axios|undici|node-fetch|@deepseek\/)/;

/** Analyze source strings through the installed TypeScript AST, including transitive dependencies. */
function analyzeSources(sources) {
  const graph = new Map(), blocked = new Map();
  const resolve = (file, specifier) => {
    if (!specifier.startsWith('.')) return null;
    const base = posix.normalize(posix.join(posix.dirname(file), specifier));
    return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(candidate => candidate in sources) ?? base;
  };
  for (const [file, content] of Object.entries(sources)) {
    const edges = new Set(); graph.set(file, edges);
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const dependency = (specifier, erased = false) => {
      const target = resolve(file, specifier);
      if (externalNetwork.test(specifier) || (target && cloud(target))) blocked.set(file, `network/cloud import ${specifier}`);
      if (!erased && target && target in sources) edges.add(target);
    };
    const visit = node => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause, named = clause?.namedBindings;
        const erased = node.isTypeOnly || clause?.isTypeOnly || (named && ts.isNamedImports(named) && !clause.name && named.elements.length > 0 && named.elements.every(item => item.isTypeOnly)) || (node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every(item => item.isTypeOnly));
        dependency(node.moduleSpecifier.text, erased);
      }
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        if ((expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(expression) && expression.text === 'require') && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) dependency(node.arguments[0].text);
        if (ts.isIdentifier(expression) && ['fetch', 'WebSocket', 'XMLHttpRequest'].includes(expression.text) || ts.isPropertyAccessExpression(expression) && ['global', 'globalThis'].includes(expression.expression.getText(source)) && ['fetch', 'WebSocket', 'XMLHttpRequest'].includes(expression.name.text)) blocked.set(file, 'network API call');
      }
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && ['WebSocket', 'XMLHttpRequest'].includes(node.expression.text)) blocked.set(file, 'network API construction');
      ts.forEachChild(node, visit);
    }; visit(source);
  }
  const violations = [];
  for (const start of graph.keys()) {
    if (!offline(start)) continue;
    const seen = new Set();
    const trace = file => {
      if (seen.has(file)) return null; seen.add(file);
      if (blocked.has(file) || cloud(file)) return [file, blocked.get(file) ?? 'cloud module'];
      for (const target of graph.get(file) ?? []) { const found = trace(target); if (found) return [file, ...found]; }
      return null;
    };
    const found = trace(start); if (found) violations.push(found.join(' -> '));
  }
  let sequence = 0; const indices = new Map(), low = new Map(), stack = [], pending = new Set(), cycles = [];
  const connect = file => {
    indices.set(file, sequence); low.set(file, sequence++); stack.push(file); pending.add(file);
    for (const target of graph.get(file) ?? []) {
      if (!indices.has(target)) { connect(target); low.set(file, Math.min(low.get(file), low.get(target))); }
      else if (pending.has(target)) low.set(file, Math.min(low.get(file), indices.get(target)));
    }
    if (low.get(file) === indices.get(file)) {
      const group = []; let member;
      do { member = stack.pop(); pending.delete(member); group.push(member); } while (member !== file);
      if (group.length > 1 || graph.get(file)?.has(file)) cycles.push(group.sort());
    }
  };
  for (const file of graph.keys()) if (!indices.has(file)) connect(file);
  return {files: graph.size, violations: violations.sort(), cycles: cycles.sort((a, b) => a[0].localeCompare(b[0]))};
}

/** Read only project TypeScript sources, excluding dependencies, environment and asset files. */
function readSources(root = process.cwd()) {
  const sources = {};
  const walk = directory => { for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    if (entry.name.startsWith('.env')) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry.name)) sources[path.relative(root, full).split(path.sep).join('/')] = fs.readFileSync(full, 'utf8');
  } }; walk(path.join(root, 'src')); return sources;
}
module.exports = {analyzeSources, readSources};
if (require.main === module) {
  const result = analyzeSources(readSources()); console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.violations.length || result.cycles.length ? 1 : 0;
}
