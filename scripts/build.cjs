require('esbuild').buildSync({
  entryPoints:['src/supabase-client.js'],bundle:true,minify:true,
  format:'iife',globalName:'MonetaSupabase',platform:'browser',target:'es2020',
  outfile:'app/supabase-client.js',legalComments:'eof'
});
