/** Automated runs never create Remote Control sessions in a real account.
 * Import first in every test entry point. An explicit GLIMPSELET_REMOTE wins,
 * so the single final live check can still ask for the disposable session. */
process.env.GLIMPSELET_REMOTE ??= "0";
