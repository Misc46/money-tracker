export interface Transaction {
    id: number;
    date: string;
    amount: number;
    type: "income" | "expense" | "saved";
    reason: string;
    description: string;
    created_at: string;
}

export interface TransactionFormData {
    date: string;
    amount: string;
    type: "income" | "expense" | "saved";
    reason: string;
    description: string;
}
