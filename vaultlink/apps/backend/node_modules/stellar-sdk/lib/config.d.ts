/**
 * Global config class.
 *
 * Usage node:
 * ```
 * import {Config} from 'stellar-sdk';
 * Config.setAllowHttp(true);
 * Config.setTimeout(5000);
 * ```
 *
 * Usage browser:
 * ```
 * StellarSdk.Config.setAllowHttp(true);
 * StellarSdk.Config.setTimeout(5000);
 * ```
 * @static
 */
declare class Config {
    /**
     * Sets `allowHttp` flag globally. When set to `true`, connections to insecure http protocol servers will be allowed.
     * Must be set to `false` in production. Default: `false`.
     * @param {boolean} value new allowHttp value
     * @returns {void}
     * @static
     */
    static setAllowHttp(value: boolean): void;
    /**
     * Sets `timeout` flag globally. When set to anything besides 0, the request will timeout after specified time (ms).
     * Default: 0.
     * @param {number} value new timeout value
     * @returns {void}
     * @static
     */
    static setTimeout(value: number): void;
    /**
     * @static
     * @returns {boolean} allowHttp flag
     */
    static isAllowHttp(): boolean;
    /**
     * @static
     * @returns {number} timeout flag
     */
    static getTimeout(): number;
    /**
     * Sets all global config flags to default values.
     * @static
     * @returns {void}
     */
    static setDefault(): void;
}
export { Config };
