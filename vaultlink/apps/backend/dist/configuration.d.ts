declare const _default: () => {
    port: number;
    database: {
        type: string;
        url: string | undefined;
        port: number;
        username: string;
        password: string;
        database: string;
        synchronize: boolean;
        logging: boolean;
        retryAttempts: number;
    };
    jwt: {
        secret: string;
        expiresIn: string;
    };
    stellar: {
        network: string;
        horizonUrl: string;
    };
    redis: {
        host: string;
        port: number;
    };
};
export default _default;
