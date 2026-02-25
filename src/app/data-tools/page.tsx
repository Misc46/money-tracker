"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import type { Transaction } from "@/types/transaction";

type SortField = "date" | "amount" | "type";
type SortOrder = "asc" | "desc";

function formatCurrency(value: number): string {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
}

function getMonthYear(dateStr: string): string {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
    });
}

export default function DataTools() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [sortField, setSortField] = useState<SortField>("date");
    const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
    const [showAllMonths, setShowAllMonths] = useState(false);

    const fetchTransactions = useCallback(async () => {
        try {
            const res = await fetch("/api/transactions");
            if (!res.ok) throw new Error("Failed to load transactions");
            const data: Transaction[] = await res.json();
            setTransactions(data);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Something went wrong";
            setError(message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    const sortedAndFilteredTransactions = useMemo(() => {
        let result = [...transactions];

        // Month Filtering
        if (!showAllMonths) {
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            result = result.filter(t => {
                const d = new Date(t.date + "T00:00:00");
                return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            });
        }

        // Sorting
        result.sort((a, b) => {
            let comparison = 0;
            if (sortField === "date") {
                comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
            } else if (sortField === "amount") {
                const valA = a.type === "income" ? a.amount : -a.amount;
                const valB = b.type === "income" ? b.amount : -b.amount;
                comparison = valA - valB;
            } else if (sortField === "type") {
                comparison = a.type.localeCompare(b.type);
            }

            return sortOrder === "asc" ? comparison : -comparison;
        });

        return result;
    }, [transactions, sortField, sortOrder, showAllMonths]);

    const insights = useMemo(() => {
        if (transactions.length === 0) return null;

        const now = new Date();
        const daysInMonthSoFar = now.getDate();

        // Liquid vs Saved
        const totalSaved = transactions.filter(t => t.type === 'saved').reduce((s, t) => s + t.amount, 0);
        const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const liquidBalance = totalIncome - totalExpense - totalSaved;

        // Burn Rate (Daily Expense)
        const currentMonthExpenses = transactions.filter(t => {
            const d = new Date(t.date + "T00:00:00");
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && t.type === 'expense';
        });
        const monthlyOutflow = currentMonthExpenses.reduce((s, t) => s + t.amount, 0);
        const dailyBurn = monthlyOutflow / daysInMonthSoFar;

        // Runway
        const runway = dailyBurn > 0 ? Math.floor(liquidBalance / dailyBurn) : '∞';

        // Savings Rate
        const savingsRate = totalIncome > 0 ? Math.round((totalSaved / totalIncome) * 100) : 0;

        // Common Patterns
        const patterns: { [key: string]: number } = {};
        transactions.filter(t => t.type === 'expense').forEach(t => {
            const key = t.reason.split(' ')[0].toLowerCase(); // Basic grouping by first word
            patterns[key] = (patterns[key] || 0) + 1;
        });
        const topPatterns = Object.entries(patterns)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        // Largest Expense
        const topExpense = currentMonthExpenses.length > 0
            ? [...currentMonthExpenses].sort((a, b) => b.amount - a.amount)[0]
            : null;

        return { runway, dailyBurn, savingsRate, topPatterns, liquidBalance, totalSaved, topExpense };
    }, [transactions]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortOrder("desc");
        }
    };

    return (
        <main className="app-container">
            <header className="app-header">
                <h1>DATA TOOLS</h1>
                <nav>
                    <Link href="/" className="nav-link">
                        Back to Wallet
                    </Link>
                </nav>
            </header>

            <section className="controls-row" style={{ marginBottom: "32px" }}>
                <div className="toggle-group">
                    <button
                        className={`toggle-btn ${!showAllMonths ? "active" : ""}`}
                        onClick={() => setShowAllMonths(false)}
                    >
                        Current Month
                    </button>
                    <button
                        className={`toggle-btn ${showAllMonths ? "active" : ""}`}
                        onClick={() => setShowAllMonths(true)}
                    >
                        All History
                    </button>
                </div>
            </section>

            {insights && (
                <section className="insights-grid">
                    <div className="insight-card">
                        <div className="insight-header">
                            <span className="insight-title">Wallet Runway</span>
                            <span className="insight-tag">Live</span>
                        </div>
                        <div className="insight-main">
                            <div className="insight-value">{insights.runway} Days</div>
                            <div className="insight-subtext">At {formatCurrency(Math.round(insights.dailyBurn))}/day burn</div>
                        </div>
                        <div className="progress-container">
                            <div
                                className="progress-bar"
                                style={{ width: `${Math.min(100, (Number(insights.runway) / 30) * 100)}%` }}
                            />
                        </div>
                    </div>

                    <div className="insight-card">
                        <div className="insight-header">
                            <span className="insight-title">Savings Rate</span>
                            <span className="insight-tag">{insights.savingsRate}%</span>
                        </div>
                        <div className="insight-main">
                            <div className="insight-value">{formatCurrency(insights.totalSaved)}</div>
                            <div className="insight-subtext">Total converted to non-liquid</div>
                        </div>
                        <div className="progress-container">
                            <div
                                className="progress-bar savings"
                                style={{ width: `${insights.savingsRate}%` }}
                            />
                        </div>
                    </div>

                    <div className="insight-card">
                        <div className="insight-header">
                            <span className="insight-title">Frequent Tags</span>
                        </div>
                        <div className="insight-main">
                            <div className="tag-list">
                                {insights.topPatterns.length > 0 ? (
                                    insights.topPatterns.map(([tag, count]) => (
                                        <span key={tag} className="insight-tag">
                                            {tag} ({count}x)
                                        </span>
                                    ))
                                ) : (
                                    <span className="insight-subtext">No patterns detected yet</span>
                                )}
                            </div>
                            <div className="insight-subtext" style={{ marginTop: '8px' }}>
                                Based on your expense reasons
                            </div>
                        </div>
                    </div>

                    <div className="insight-card">
                        <div className="insight-header">
                            <span className="insight-title">Top Expense</span>
                            <span className="insight-tag">Check</span>
                        </div>
                        <div className="insight-main">
                            {insights.topExpense ? (
                                <>
                                    <div className="insight-value">{formatCurrency(insights.topExpense.amount)}</div>
                                    <div className="insight-subtext">{insights.topExpense.reason}</div>
                                </>
                            ) : (
                                <div className="insight-subtext">No expenses this month</div>
                            )}
                        </div>
                        <div className="progress-container">
                            <div className="progress-bar income" style={{ width: '100%' }} />
                        </div>
                    </div>
                </section>
            )}

            <div className="section-header">
                <div className="title-group">
                    <h2>Insights & Sorting</h2>
                    <span className="view-indicator">
                        {sortedAndFilteredTransactions.length} Items
                    </span>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
            ) : error ? (
                <div className="error-toast">{error}</div>
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th onClick={() => handleSort("date")} style={{ cursor: 'pointer' }}>
                                    Date {sortField === "date" && (sortOrder === "asc" ? "↑" : "↓")}
                                </th>
                                <th>Reason</th>
                                <th onClick={() => handleSort("type")} style={{ cursor: 'pointer' }}>
                                    Type {sortField === "type" && (sortOrder === "asc" ? "↑" : "↓")}
                                </th>
                                <th onClick={() => handleSort("amount")} style={{ textAlign: 'right', cursor: 'pointer' }}>
                                    Amount {sortField === "amount" && (sortOrder === "asc" ? "↑" : "↓")}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedAndFilteredTransactions.map((t) => (
                                <tr key={t.id}>
                                    <td className="cell-date">{t.date}</td>
                                    <td>
                                        <div className="cell-reason">{t.reason}</div>
                                        {t.description && <div className="cell-desc">{t.description}</div>}
                                    </td>
                                    <td>
                                        <span className={`cell-type type-${t.type}`}>{t.type}</span>
                                    </td>
                                    <td className={`cell-amount ${t.type}`}>
                                        {t.type === "income" ? "+" : t.type === "expense" ? "−" : "↓"}
                                        {formatCurrency(t.amount)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </main>
    );
}
