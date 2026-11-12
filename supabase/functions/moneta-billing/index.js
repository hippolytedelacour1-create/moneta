import {createHandler} from '../_shared/billing-handler.mjs';
Deno.serve(createHandler({env:name=>Deno.env.get(name)}));
