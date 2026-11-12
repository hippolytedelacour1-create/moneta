require('esbuild').buildSync({entryPoints:['supabase/functions/moneta-billing/index.js'],bundle:true,format:'esm',platform:'neutral',target:'es2022',outfile:'work/moneta-billing/index.js'});
