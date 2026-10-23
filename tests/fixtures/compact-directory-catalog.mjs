import catalog from './catalog.json' with { type: 'json' };
import directoryResources from './compact-directory-resources.json' with { type: 'json' };
import pathResources from './compact-learning-path-resources.json' with { type: 'json' };

// Keep the shared cases while exercising directories and published/withdrawn path steps.
process.stdout.write(`${JSON.stringify([...catalog, ...directoryResources, ...pathResources], null, 2)}\n`);
