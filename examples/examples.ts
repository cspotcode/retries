import {retry} from '@cspotcode/retries';
import {db} from './database';
import {cleanupCache} from './cache';
import { matches } from 'lodash';

// Create an error matcher for a known error we should retry.
// In this example, match an error from our database that indicates it is
// still scaling up capacity.  This means subsequent requests will soon succeed.
// Non-matching errors will be thrown and abort any retrying.
// 
// NOTE: matching objects like this require lodash be installed as a peer dependency.
// Instead of matching objects, you can pass a function which must return true if the
// error matches.
const onDatabaseScalingError = retry.ifErrorMatches({
    code: 'DB_INSUFFICIENT_SCALE'
});

// Create a reusable retry behavior for database calls
// Filtering & abort handlers should come first
// Time-based (delay, backoff) handler should come last
const retryDatabaseCall = retry.create(
    onDatabaseScalingError,
    retry.deadlineSec(15), // give up after 15 seconds of trying
    retry.exponentialBackoff({
        maxDelay: 5e3,
        jitter: true
    }),
);

// Use the behavior for multiple database operations.
const account = await retryDatabaseCall(() => db.getAccount('156'));
const blogPosts = await retryDatabaseCall(() => db.getPostsForAccount(account));

// For one-off operations, specify retry operations inline
// For example, delay 100ms between attempts, maximum of 20 attempts
await retry(cleanupCache, retry.tries(20), retry.delayMs(100));

