const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const PROHIBIDOS = /^(express(?:\/|$)|@prisma\/|pg(?:\/|$)|mysql2(?:\/|$)|nodemailer(?:\/|$)|firebase-admin(?:\/|$)|cloudinary(?:\/|$)|@aws-sdk\/|@node-rs\/argon2|(?:node:)?(?:fs|http|https|net|tls|child_process)(?:\/|$))/;
const normal = (p) => p.split(path.sep).join('/');

function archivos(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['generated', 'node_modules'].includes(entry.name)) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? archivos(file) : /\.[cm]?[jt]sx?$/.test(file) && !/\.d\.ts$/.test(file) ? [file] : [];
  });
}

function dependencias(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const imports = [];
  const limites = [];
  function add(node, expression, kind) {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    if (expression && ts.isStringLiteralLike(expression)) imports.push({ specifier: expression.text, line });
    else limites.push({ file, line, kind });
  }
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) add(node, node.moduleSpecifier, 'import/export');
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node, node.moduleReference.expression, 'import=require');
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node, node.argument.literal, 'import de tipos');
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) add(node, node.arguments[0], 'destino computado');
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { imports, limites };
}

function verificar(root) {
  root = path.resolve(root);
  const configFile = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  if (!configFile) throw new Error('Falta tsconfig.json para resolver las dependencias.');
  const config = ts.readConfigFile(configFile, ts.sys.readFile);
  if (config.error) throw new Error('No se pudo leer tsconfig.json.');
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configFile));
  if (parsed.errors.length) throw new Error('tsconfig.json no permite resolver las dependencias.');
  const relative = (file) => normal(path.relative(root, file));
  const role = (file) => {
    const match = /^src\/modules\/([^/]+)\/(.*)$/.exec(relative(file));
    if (!match) return null;
    return { module: match[1], rest: match[2], layer: /^(dominio|aplicacion|presentacion|infraestructura)\//.exec(match[2])?.[1] };
  };
  const graph = new Map();
  const limites = [];
  for (const file of archivos(path.join(root, 'src'))) {
    const extracted = dependencias(file);
    limites.push(...extracted.limites.map((e) => ({ ...e, file: relative(e.file) })));
    graph.set(file, extracted.imports.map((edge) => ({
      ...edge,
      resolved: ts.resolveModuleName(edge.specifier, file, parsed.options, ts.sys).resolvedModule?.resolvedFileName,
    })));
  }
  const infringements = [];
  const add = (file, edge, rule, via = []) => infringements.push({ file: relative(file), line: edge.line, dependencia: edge.specifier, regla: rule, via: via.map(relative) });
  for (const [file, edges] of graph) {
    const source = role(file);
    for (const edge of edges) {
      const target = edge.resolved && role(path.resolve(edge.resolved));
      if (source && target && source.module !== target.module && target.rest !== 'index.ts') add(file, edge, 'internos-de-otro-modulo');
      if (edge.specifier.startsWith('.') && !edge.resolved) add(file, edge, 'dependencia-local-no-resuelta');
    }
    if (!source || !['dominio', 'aplicacion'].includes(source.layer)) continue;
    const seen = new Set();
    const pending = [{ file, via: [] }];
    while (pending.length) {
      const current = pending.pop();
      if (seen.has(current.file)) continue;
      seen.add(current.file);
      for (const edge of graph.get(current.file) || []) {
        const targetFile = edge.resolved && path.resolve(edge.resolved);
        const target = targetFile && role(targetFile);
        const targetRel = targetFile && relative(targetFile);
        let rule;
        if (PROHIBIDOS.test(edge.specifier)) rule = 'tecnologia-en-capa-interna';
        else if (targetRel?.startsWith('src/generated/')) rule = 'cliente-generado-en-capa-interna';
        else if (target?.layer && ['presentacion', 'infraestructura'].includes(target.layer)) rule = 'dependencia-hacia-capa-externa';
        else if (source.layer === 'dominio' && target?.layer === 'aplicacion') rule = 'dominio-depende-de-aplicacion';
        else if (target && target.module === source.module && (target.rest === 'index.ts' || target.rest === `${source.module}.module.ts`)) rule = 'composicion-desde-capa-interna';
        if (rule) add(file, edge, rule, [...current.via, current.file]);
        else if (targetFile && graph.has(targetFile)) pending.push({ file: targetFile, via: [...current.via, current.file] });
      }
    }
  }
  const unique = [...new Map(infringements.map((i) => [JSON.stringify(i), i])).values()];
  return { archivos: graph.size, infracciones: unique, limites };
}

function main(args = process.argv.slice(2)) {
  try {
    const root = args[0] === '--raiz' ? args[1] : path.resolve(__dirname, '..');
    if (!root || (args.length && (args[0] !== '--raiz' || args.length !== 2))) throw new Error('Uso: verificar-arquitectura.cjs [--raiz directorio]');
    const result = verificar(root);
    for (const i of result.infracciones) console.error(`${i.file}:${i.line} ${i.regla}: ${i.dependencia}${i.via.length > 1 ? ` (via ${i.via.join(' -> ')})` : ''}`);
    console.log(`Arquitectura: ${result.archivos} archivos, ${result.infracciones.length} infracciones estaticas, ${result.limites.length} destinos computados para revision manual.`);
    return result.infracciones.length ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'No se pudo verificar la arquitectura.');
    return 1;
  }
}

if (require.main === module) process.exitCode = main();
module.exports = { verificar, dependencias, main };
