# Deno and Bun

Both hand over a standard Request, so the core is used as is.

Deno (Deno Deploy or your own server):

```js
import { handle } from "./.pointtoship/lib/pointtoship-core.mjs";
Deno.serve((request) => handle(request, Deno.env.toObject()));
```

Bun:

```js
import { handle } from "./.pointtoship/lib/pointtoship-core.mjs";
Bun.serve({ port: 8787, fetch: (request) => handle(request, process.env) });
```

Mount it under `/api/pointtoship` in the app's own router, or run it on its
own and set `PTS_ORIGINS`.
