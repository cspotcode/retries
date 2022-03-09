import {retry} from '@cspotcode/retries';

const onDatabaseScalingError = retry.ifErrorMatches({
    code: 'DB_INSUFFICIENT_SCALE'
});

async function doIt() {
    const result = await retry(
        () => getRow({}),

        // Zero or more RetryCallbacks, invoked in a chain.  If any one throws,
        // it aborts the chain.

        onDatabaseScalingError, // Example of a user-specified filter: only retry if error is expected database scaling error
        retry.ifErrorMatches({code: 123}),
        retry.delaySec(5), // static delay between attempts
        retry.exponentialBackoff(options), // increasing delay
        retry.deadlineSec(60), // Stop attempting retries once this much total time has elapsed since first attempt started
        retry.tries(5), // Cap the maximum number of attempts
    );
    retry.create(
        retry.deadlineSec(60),
        retry.exponentialBackoff({
            initialDelay: 1e3,

        })
    );

    // Create reusable retry-er with preconfigured behaviors.
    const retryDbCalls = retry.create(onDatabaseScalingError, retry.delaySec(5), retry.tries(5));

    const row = await retryDbCalls(() => getRow({primary_key: 123}));

}