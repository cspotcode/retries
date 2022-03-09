# @cspotcode/retries

Composable, reusable retry behaviors. Retry an action repeatedly until it
succeeds. Or describe your intended retry behavior once, then reuse that
behavior across multiple operations.

See [examples.ts](./examples/examples.ts) for usage.

## Quick start

By default, retry will try forever with zero delay between attempts.  If the callback throws/rejects, that is considered a failure, to be retried.

```
// Retry forever until a connection is established
const socket = await retry(async () => {
  return await websocket.connect('my-server.domain');
});
```

The real power of `retry` is its ability to compose reusable retry behaviors via "handlers."

In its simplest form, a "handler" is a function that is invoked after a failed
attempt and before the next attempt.  Behaviors can add delay between attempts,
abort the retry loop, log diagnostic information, or anything else you might
want to do between attempts.

Two workflows are supported:

- execute a single action with retry handlers declared inline
- create a retry behavior composed of multiple handlers, then reuse it for multiple actions

### Single action

```typescript twoslash
import {retry} from '@cspotcode/retries';
const result = await retry(actionFunction, handlerA, handlerB);
```

### Compose a reusable behavior

```typescript twoslash
import {retry} from '@cspotcode/retries';
// Max of 5 retries, 5s pause between each
const myRetryBehavior = retry.create(retry.tries(5), retry.delaySec(5));
// Use the behavior to attempt a search query.
const resultA = await myRetryBehavior(() => api.query(searchParams));
```

## Concepts

`retry()` executes an async operation, an "action."

If it returns a value, that value is returned and no more retries are attempted. If it throws an error, the error
is caught and passed to zero or more "handlers."  Then the action is retried.

Handlers are invoked in order and are responsible for customizing retry behaviors.

For example, they can:

- rethrow the error to abort retrying
  - can be used to stop when you exceed a maximum number of retries
  - can be used to abort on unrecognized errors
- add a delay between attempts
  - they are async functions, so they can delay before resolving
  - our `exponentialBackoff` handler implements exponential delay w/ jitter
- log status information about retry attempts
  - for example, <code>console.log(`Attempt ${state.attempts} failed, retrying...`)</code>

A collection of error handlers are included for common situations:

- exponential backoff
- checking for expected errors
- constant delay between attempts
- stop retries once a deadline has been reached
- limiting to a maximum number of attempts
