Utility for retrying an action repeatedly until it succeeds.

See [./examples](./examples) for usage.

Pass an async action function and zero or more async error handlers.

If the action function throws an error, the error will be passed to the error
handlers one at a time.  Each can choose to:

- throw the error to abort retrying
- delay between attempts
- filter the error, throwing if it is unrecognized
- log information about the retry attempts

A collection of error handlers are included for common situations:

- exponential backoff
- checking for expected errors
- constant delay between attempts
- stop retries once a deadline has been reached
- limiting to a maximum number of attempts
