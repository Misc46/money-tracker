import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import type { Transaction } from "@/types/transaction";

let initialized = false;

async function ensureInit() {
    if (!initialized) {
        await initDb();
        initialized = true;
    }
}

export async function GET() {
    try {
        await ensureInit();
        const result = await db.execute(
            "SELECT * FROM transactions ORDER BY date DESC, created_at DESC"
        );
        const transactions: Transaction[] = result.rows.map((row) => ({
            id: row.id as number,
            date: row.date as string,
            amount: row.amount as number,
            type: row.type as "income" | "expense",
            reason: row.reason as string,
            description: (row.description as string) ?? "",
            created_at: row.created_at as string,
        }));
        return NextResponse.json(transactions);
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to fetch transactions";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        await ensureInit();
        const body = await request.json();
        const { date, amount, type, reason, description } = body;

        if (!date || amount === undefined || !type || !reason) {
            return NextResponse.json(
                { error: "Missing required fields: date, amount, type, reason" },
                { status: 400 }
            );
        }

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return NextResponse.json(
                { error: "Amount must be a positive number" },
                { status: 400 }
            );
        }

        if (!["income", "expense"].includes(type)) {
            return NextResponse.json(
                { error: "Type must be 'income' or 'expense'" },
                { status: 400 }
            );
        }

        const result = await db.execute({
            sql: `INSERT INTO transactions (date, amount, type, reason, description) 
            VALUES (?, ?, ?, ?, ?)`,
            args: [date, parsedAmount, type, reason, description ?? ""],
        });

        return NextResponse.json(
            { id: Number(result.lastInsertRowid), message: "Transaction added" },
            { status: 201 }
        );
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to create transaction";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        await ensureInit();
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { error: "Transaction ID is required" },
                { status: 400 }
            );
        }

        await db.execute({
            sql: "DELETE FROM transactions WHERE id = ?",
            args: [parseInt(id)],
        });

        return NextResponse.json({ message: "Transaction deleted" });
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to delete transaction";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
