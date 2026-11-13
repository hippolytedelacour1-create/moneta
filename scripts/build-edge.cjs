require('esbuild').buildSync({entryPoints:['supabase/functions/moneta-billing/index.js'],bundle:true,format:'esm',platform:'neutral',target:'es2022',outfile:'work/moneta-billing/index.js'});

// Build production handler only for static code checks. Checkout stays server-disabled.
require('esbuild').buildSync({entryPoints:['supabase/functions/moneta-billing-live/index.ts'],bundle:true,format:'esm',platform:'neutral',target:'es2022',outfile:'work/moneta-billing-live/index.js'});
