/** Machine-readable error codes thrown by @fils/core. */
export type FilsErrorCode =
    | 'INVALID_AMOUNT'
    | 'INVALID_ADDRESS'
    | 'INVALID_TOKEN'
    | 'INVALID_URL'
    | 'INCONSISTENT_INPUT'
    | 'AMOUNT_OUT_OF_RANGE';

export class FilsError extends Error {
    readonly code: FilsErrorCode;

    constructor(code: FilsErrorCode, message: string) {
        super(message);
        this.name = 'FilsError';
        this.code = code;
    }
}
