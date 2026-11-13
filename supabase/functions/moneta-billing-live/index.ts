import './data.js';
import './plus-model.js';
import {createHandler} from './live-billing-handler.mjs';
Deno.serve(createHandler({env:name=>Deno.env.get(name)}));
