// Cloudflare Pages runs this before every request to the fellows' site:
// the invite-code check lives in tools/fellows/access.mjs.
import {handle} from "../tools/fellows/access.mjs";

export const onRequest = ctx => handle(ctx.request, ctx.env, ctx.next);
