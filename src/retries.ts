import type * as _lodash from "lodash";
let lodash: typeof _lodash | undefined = undefined;
const _ = {
    get isMatch(): typeof _lodash.isMatch {
        lodash ??= require('lodash') as typeof _lodash;
        return lodash!.isMatch;
    }
}

export type RetryAction<T> = () => PromiseLike<T>;
// Each non-action callback receives:
export type RetryHandler = (error: Thrown, state: RetryState) => PromiseLike<void> | void;
export interface RetryState {
    attempts: number;
    startTime: Date;
    /** Most recently thrown error.  Can be reassigned by handlers to replace or wrap the error. */
    error: Thrown;
    /** Array of all errors from all failed attempts.  Can be used, for example, to throw an
     * `AggregateError` when maximum retries have failed. */
    errors: Thrown[];
}
export type Thrown = any;

export async function retry<T>(action: () => PromiseLike<T>, ...errorHandlers: Array<RetryHandler>): Promise<T> {
    const startTime = new Date();
    const errors = [];
    for (let attempts = 1; ; attempts++) {
        try {
            return await action();
        } catch(error) {
            errors.push(error);
            const state: RetryState = {error, attempts, startTime, errors};
            for(const onErrorFn of errorHandlers) {
                await onErrorFn(state.error, state);
                errors[errors.length - 1] = state.error;
            }
        }
    }
}

export interface RetryBehavior {
    <T>(action: RetryAction<T>, ...handlers: RetryHandler[]): Promise<T>;
    prefix(...additionalPrefixHandlers: RetryHandler[]): RetryBehavior;
    postfix(...additionalPostfixHandlers: RetryHandler[]): RetryBehavior;
}

export namespace retry {
    export function create(prefixHandlers: RetryHandler[], postfixHandlers?: RetryHandler[]): RetryBehavior;
    export function create(...prefixHandlers: RetryHandler[]): RetryBehavior;
    export function create(...rest: any[]) {
        if(Array.isArray(rest[0])) {
            return createInternal(rest[0], rest[1]);
        } else {
            return createInternal(rest, []);
        }
    }


    function createInternal(prefixHandlers: RetryHandler[], postfixHandlers: RetryHandler[] = []) {
        reusableRetry.prefix = prefix;
        reusableRetry.postfix = postfix;
        return reusableRetry;

        function reusableRetry<T>(action: RetryAction<T>, ...infixHandlers: RetryHandler[]) {
            return retry(action, ...prefixHandlers, ...infixHandlers, ...postfixHandlers);
        }

        function prefix(...additionalPrefixHandlers: RetryHandler[]) {
            return createInternal([...prefixHandlers, ...additionalPrefixHandlers], [...postfixHandlers]);
        }
        function postfix(...additionalPostfixHandlers: RetryHandler[]) {
            return createInternal([...prefixHandlers], [...postfixHandlers, ...additionalPostfixHandlers]);
        }
    }

    /** To be more explicit about retries, throw this value */
    export const RETRY = Symbol();

    /** Will only retry if the thrown value is `retry.RETRY`; otherwise rethrows the error */
    export function explicitly(error: Thrown) {
        if(error !== RETRY) throw error;
    }

    export function ifTrue(predicate: (error: Thrown, state: RetryState) => boolean | PromiseLike<boolean>): RetryHandler {
        return ifHandler;
        function ifHandler(error: Thrown, state: RetryState) {
            if(!predicate(error, state)) throw error;
        }
    }

    /**
     * Create a handler that only retries for errors matching one of the matchers.
     * If a matcher is a function, it must return true or false to indicate matching or not-matching.
     * Otherwise, we use lodash `_.isMatch(error, matcher)` to check the error against the matcher.
     * 
     * Multiple matchers can be passed.  The error only needs to match a single matcher to be considered
     * retry-able.
     * 
     * NOTE: lodash is a peerDependency; you must install this yourself if you want to use
     * object-matching.
     */
    export function ifErrorMatches(...matchers: Array<object | ((error: Thrown) => boolean)>) {
        return ifErrorMatchesHandler;
        function ifErrorMatchesHandler(error: Thrown) {
            if(!matchers.some(obj => {
                return typeof obj === 'function' ? obj(error) : _.isMatch(error, obj);
            })) throw error;;
        }
    }

    /** Create a handler that delays a fixed time in seconds */
    export function delaySec(seconds: number) {
        return delayMs(seconds * 1e3);
    }
    /** Create a handler that delays a fixed time in milliseconds */
    export function delayMs(milliseconds: number) {
        return delayHandler;
        async function delayHandler() {
            await sleep(milliseconds);
        }
    }
    /**
     * Create a handler that stops retrying once a total time in seconds has elapsed.
     * NOTE: does not cancel actions in progress; only aborts after the action
     * throws an error.
     */
    export function deadlineSec(seconds: number) {
        return deadlineMs(seconds * 1e3);
    }
    /**
     * Create a handler that stops retrying once a total time in milliseconds has elapsed.
     * NOTE: does not cancel actions in progress; only aborts after the action
     * throws an error.
     */
    export function deadlineMs(milliseconds: number) {
        return deadlineHandler;
        function deadlineHandler(error: Thrown, state: RetryState) {
            const timeSpentSoFar = (+new Date()) - (+state.startTime);
            if(timeSpentSoFar > milliseconds) throw error;
        }
    }
    /** Limit to a maximum number of attempts. */
    export function tries(maxTries: number) {
        return function(error: Thrown, state: RetryState) {
            if(state.attempts >= maxTries) throw error;
        }
    }

}

export interface ExponentialBackoffOptions {
    /**
     * If `true`, applies jitter to the delay between attempts.
     * https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
     * Default: false
     */
    jitter?: boolean;
    /**
     * Cap the delay between attempts to a maximum in milliseconds. Default: Infinity
     */
    maxDelay?: number;
    /**
     * Delay after first failure.  Will exponentially increase for subsequent attempts. Default: 100ms
     */
    initialDelay?: number;
    /**
     * Cap maximum number of attempts before aborting. Default: 10
     */
    maxAttempts?: number;
    /**
     * Multiplier applied to delay for each subsequent attempt. Default: 2
     */
    timeMultiple?: number;
}

type FullExponentialBackoffOptions = Required<ExponentialBackoffOptions>;
const defaultExponentialBackoffOptions: FullExponentialBackoffOptions = {
    jitter: false,
    maxDelay: Number.POSITIVE_INFINITY,
    initialDelay: 100,
    maxAttempts: 10,
    timeMultiple: 2
}

export namespace retry {
    /** Retry with exponential backoff */
    export function exponentialBackoff(options: ExponentialBackoffOptions) {
        const fullOptions = {...defaultExponentialBackoffOptions, ...options};
        const {initialDelay, jitter, maxAttempts, maxDelay, timeMultiple} = fullOptions;
        return exponentialBackoffHandler;
        function exponentialBackoffHandler(error: Thrown, state: RetryState) {
            if(state.attempts >= maxAttempts) throw error;
            let delay = initialDelay * Math.pow(timeMultiple, state.attempts - 1);
            delay = Math.min(delay, maxDelay);
            if(jitter) delay = delay * Math.random();

        }
    }
}

function sleep(milliseconds: number) {
    return new Promise((res) => {
        setTimeout(res, milliseconds);
    });
}

export const {RETRY, create, deadlineMs, deadlineSec, delayMs, delaySec, explicitly, exponentialBackoff, ifErrorMatches, ifTrue, tries} = retry;
