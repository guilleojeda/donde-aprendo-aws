import catalog from './catalog.json' with { type: 'json' };
import directoryResources from './compact-directory-resources.json' with { type: 'json' };

// Keep the shared catalog cases while populating directory-specific variants.
process.stdout.write(`${JSON.stringify([...catalog, ...directoryResources], null, 2)}\n`);
