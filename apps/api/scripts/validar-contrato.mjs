import SwaggerParser from '@apidevtools/swagger-parser';

const api = await SwaggerParser.validate('openapi.yaml');
const operaciones = Object.entries(api.paths).flatMap(([ruta, item]) =>
  Object.keys(item).map((metodo) => `${metodo.toUpperCase()} ${ruta}`),
);
console.log(`Contrato valido (OpenAPI ${api.openapi}). Operaciones:\n  ${operaciones.join('\n  ')}`);
