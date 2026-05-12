# Installation
> `npm install --save @types/passport-jwt`

# Summary
This package contains type definitions for passport-jwt (https://github.com/themikenicholson/passport-jwt).

# Details
Files were exported from https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/passport-jwt.
## [index.d.ts](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/passport-jwt/index.d.ts)
````ts
import * as express from "express";
import { VerifyOptions } from "jsonwebtoken";
import { Strategy as PassportStrategy } from "passport-strategy";

export declare class Strategy extends PassportStrategy {
    constructor(opt: StrategyOptions, verify: VerifyCallback);
    constructor(opt: StrategyOptions, verify: VerifyCallbackWithRequest);
    name: string;
}

export interface StrategyOptions {
    secretOrKey?: string | Buffer | undefined;
    secretOrKeyProvider?: SecretOrKeyProvider | undefined;
    jwtFromRequest: JwtFromRequestFunction;
    issuer?: string | string[] | undefined;
    audience?: string | string[] | undefined;
    algorithms?: string[] | undefined;
    ignoreExpiration?: boolean | undefined;
    passReqToCallback?: boolean | undefined;
    jsonWebTokenOptions?: VerifyOptions | undefined;
}

export interface VerifyCallback {
    (payload: any, done: VerifiedCallback): void;
}

export interface VerifyCallbackWithRequest {
    (req: express.Request, payload: any, done: VerifiedCallback): void;
}

export interface VerifiedCallback {
    (error: any, user?: Express.User | false, info?: any): void;
}

export interface JwtFromRequestFunction {
    (req: express.Request): string | null;
}

export interface SecretOrKeyProvider {
    (request: express.Request, rawJwtToken: any, done: (err: any, secretOrKey?: string | Buffer) => void): void;
}

export declare namespace ExtractJwt {
    export function fromHeader(header_name: string): JwtFromRequestFunction;
    export function fromBodyField(field_name: string): JwtFromRequestFunction;
    export function fromUrlQueryParameter(param_name: string): JwtFromRequestFunction;
    export function fromAuthHeaderWithScheme(auth_scheme: string): JwtFromRequestFunction;
    export function fromAuthHeader(): JwtFromRequestFunction;
    export function fromExtractors(extractors: JwtFromRequestFunction[]): JwtFromRequestFunction;
    export function fromAuthHeaderAsBearerToken(): JwtFromRequestFunction;
}

````

### Additional Details
 * Last updated: Tue, 07 Nov 2023 09:09:39 GMT
 * Dependencies: [@types/express](https://npmjs.com/package/@types/express), [@types/jsonwebtoken](https://npmjs.com/package/@types/jsonwebtoken), [@types/passport-strategy](https://npmjs.com/package/@types/passport-strategy)

# Credits
These definitions were written by [TANAKA Koichi](https://github.com/mugeso), [Alex Young](https://github.com/alsiola), [Carlos Eduardo Scheffer](https://github.com/carlosscheffer), [Byungjin Kim](https://github.com/jindev), and [Svyatoslav Bychkov](https://github.com/stbychkov).
