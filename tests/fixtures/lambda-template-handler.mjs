import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';

export async function readLambdaTemplateHandler(templateName, logicalResource) {
  const templatePath = new URL(`../../infra/${templateName}.yaml`, import.meta.url);
  const source = (await readFile(templatePath, 'utf8'))
    .replace(/Target: !Join\s+- ''\s+-\s+- integrations\/\s+- !Ref SubmissionIntegration/u,
      'Target: integrations/SubmissionIntegration')
    .replace(/!(?:Ref|GetAtt|Sub|Not|Equals|Join)\s*/gu, '');
  const template = parse(source);
  const properties = template?.Resources?.[logicalResource]?.Properties;
  if (typeof properties?.Runtime !== 'string' || typeof properties?.Handler !== 'string') {
    throw new Error(`Missing Lambda runtime/handler for ${templateName}.${logicalResource}`);
  }
  const separator = properties.Handler.lastIndexOf('.');
  if (separator < 1 || separator === properties.Handler.length - 1) {
    throw new Error(`Invalid Lambda handler declaration: ${properties.Handler}`);
  }
  return {
    handler: properties.Handler,
    runtime: properties.Runtime,
    module: properties.Handler.slice(0, separator),
    exportName: properties.Handler.slice(separator + 1),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , templateName, logicalResource] = process.argv;
  const declaration = await readLambdaTemplateHandler(templateName, logicalResource);
  process.stdout.write(`${JSON.stringify(declaration)}\n`);
}
