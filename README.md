# @cspotcode/retries

Composable, reusable retry behaviors. Retry an action repeatedly until it
succeeds. Or describe your intended retry behavior once, then reuse that
behavior across multiple operations.

See [examples.ts](./examples/examples.ts) for usage.

## Quick start

Two workflows are supported:

- execute a single action with retry handlers declared inline
- create a reusable retry behavior, then reuse it for multiple actions

### Single action

```typescript twoslash
import {retry} from '@cspotcode/retries';
const result = await retry(actionFunction, handlerA, handlerB);
```

### Compose a reusable behavior

```typescript twoslash
import {retry} from '@cspotcode/retries';
const myRetryBehavior = retry.create(retry.tries(5), retry.delaySec(5));
const resultA = await myRetryBehavior(() => api.query(searchParams));
```

## Concepts

This library executes an async operation, an "action."  If it returns a value,
that value is returned.

If it throws an error, the error is caught and passed to zero or more "handlers."  

Handlers are invoked in order and are responsible for all retry behaviors.  The
can:

- throw the error to abort retrying
  - for example, when you exceed a maximum number of retries
- delay between attempts
  - they are async functions, so they can delay before resolving
- filter the error, throwing if it is unrecognized
  - if a handler re-throws the error or throws a new error, retrying aborts
    with that error
- log status information about retry attempts
  - for example, <code>console.log(`Attempt ${state.attempts} failed, retrying...`)</code>

A collection of error handlers are included for common situations:

- exponential backoff
- checking for expected errors
- constant delay between attempts
- stop retries once a deadline has been reached
- limiting to a maximum number of attempts
