import '../../../app/data.js';
import '../../../app/plus-model.js';
import {createHandler} from '../_shared/live-billing-handler.mjs';
Deno.serve(createHandler({env:name=>Deno.env.get(name)}));
