export declare namespace Api {
    interface Record {
        account_id: string;
        memo_type?: string;
        memo?: string;
    }
    interface Options {
        allowHttp?: boolean;
        timeout?: number;
    }
}
