import { partial, isMatch } from "lodash";

export type RetryAction<T> = () => PromiseLike<T>;
// Each non-action callback receives:
export type RetryErrorHandler = (error: Thrown, state: RetryState) => PromiseLike<void> | void;
export interface RetryState {
    attempts: number;
    startTime: Date;
    error: any;
}
export type Thrown = any;

export async function retry<T>(action: () => PromiseLike<T>, ...errorHandlers: Array<RetryErrorHandler>): Promise<T> {
    const startTime = new Date();
    const errors = [];
    for (let attempts = 1; ; attempts++) {
        try {
            return await action();
        } catch(error) {
            errors.push(error);
            const state = {error, attempts, startTime, errors};
            for(const onErrorFn of errorHandlers) {
                await onErrorFn(state.error, state);
            }
        }
    }
}
export namespace retry {
    /** To be more explicit about retries, throw this value */
    export const RETRY = Symbol();

    /** Will only retry if the thrown value is `retry.RETRY`; otherwise rethrows the error */
    export function explicitly(error: Thrown) {
        if(error !== RETRY) throw error;
    }

    /**  */
    export function ifTrue(predicate: (error: Thrown, state: RetryState) => boolean | PromiseLike<boolean>): RetryErrorHandler {
        return ifHandler;
        function ifHandler(error: Thrown, state: RetryState) {
            if(!predicate(error, state)) throw error;
        }
    }

    export function create(...args: RetryErrorHandler[]) {
        return partial(retry, partial.placeholder, ...args) as TODO;
    }
    export function ifErrorMatches(...objects: Array<object | ((error: Thrown) => boolean)>) {
        return ifErrorMatchesHandler;
        function ifErrorMatchesHandler(error: Thrown) {
            if(!objects.some(obj => {
                return typeof obj === 'function' ? obj(error) : isMatch(error, obj);
            })) throw error;;
        }
    }
    export function delaySec(seconds: number) {
        return delayMs(seconds * 1e3);
    }
    export function delayMs(milliseconds: number) {
        return delayHandler;
        async function delayHandler() {
            await sleep(milliseconds);
        }
    }
    export function deadlineSec(seconds: number) {
        return deadlineMs(seconds * 1e3);
    }
    export function deadlineMs(milliseconds: number) {
        return deadlineHandler;
        function deadlineHandler(error: Thrown, state: RetryState) {
            const timeSpentSoFar = (+new Date()) - (+state.startTime);
            if(timeSpentSoFar > milliseconds) throw error;
        }
    }
    export function tries(maxTries: number) {
        return function(error: Thrown, state: RetryState) {
            if(state.attempts >= maxTries) throw error;
        }
    }

}

export interface ExponentialBackoffOptions {
    jitter?: boolean;
    maxDelay?: number;
    initialDelay?: number;
    maxAttempts?: number;
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
