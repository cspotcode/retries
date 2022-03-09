export declare const db: {
    getAccount(id: string): Promise<Account>;
    getPostsForAccount(account: Account): Promise<any[]>;
};
interface Account {
    id: string;
    name: string;
    created_date: Date;
}