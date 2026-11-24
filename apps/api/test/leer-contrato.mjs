import SwaggerParser from '@apidevtools/swagger-parser';
import { fileURLToPath } from 'node:url';

// No sustituye el parser: conserva la desreferenciación real usada por las aserciones HTTP.
const contrato = await SwaggerParser.dereference(fileURLToPath(new URL('../openapi.yaml', import.meta.url)));
process.stdout.write(JSON.stringify(contrato));
