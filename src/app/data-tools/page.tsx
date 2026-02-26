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
        maximumFractionDigits: 2,
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

    // Filter State
    const [sortField, setSortField] = useState<SortField>("date");
    const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
    const [showAllMonths, setShowAllMonths] = useState(false);

    const [searchQuery, setSearchQuery] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [minAmount, setMinAmount] = useState("");
    const [maxAmount, setMaxAmount] = useState("");
    const [typeFilter, setTypeFilter] = useState<string>("all");

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

    const filteredTransactions = useMemo(() => {
        let result = [...transactions];

        // 1. Month Quick Filter
        if (!showAllMonths && !startDate && !endDate) {
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            result = result.filter(t => {
                const d = new Date(t.date + "T00:00:00");
                return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            });
        }

        // 2. Date Range
        if (startDate) {
            result = result.filter(t => t.date >= startDate);
        }
        if (endDate) {
            result = result.filter(t => t.date <= endDate);
        }

        // 3. Amount Range
        if (minAmount) {
            result = result.filter(t => t.amount >= parseFloat(minAmount));
        }
        if (maxAmount) {
            result = result.filter(t => t.amount <= parseFloat(maxAmount));
        }

        // 4. Search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(t =>
                t.reason.toLowerCase().includes(query) ||
                (t.description && t.description.toLowerCase().includes(query))
            );
        }

        // 5. Type
        if (typeFilter !== "all") {
            result = result.filter(t => t.type === typeFilter);
        }

        // 6. Sorting
        result.sort((a, b) => {
            let comparison = 0;
            if (sortField === "date") {
                comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
            } else if (sortField === "amount") {
                comparison = a.amount - b.amount;
            } else if (sortField === "type") {
                comparison = a.type.localeCompare(b.type);
            }

            return sortOrder === "asc" ? comparison : -comparison;
        });

        return result;
    }, [transactions, sortField, sortOrder, showAllMonths, startDate, endDate, minAmount, maxAmount, searchQuery, typeFilter]);

    const insights = useMemo(() => {
        if (transactions.length === 0) return null;

        const now = new Date();
        const daysInMonthSoFar = now.getDate();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

        // Totals (based on filtered set)
        const currentSet = filteredTransactions;
        const totalSaved = currentSet.filter(t => t.type === 'saved').reduce((s, t) => s + t.amount, 0);
        const totalIncome = currentSet.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const totalExpense = currentSet.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const liquidBalance = totalIncome - totalExpense - totalSaved;

        // Burn Rate (based on ALL transactions in current month for accuracy)
        const currentMonthTransactions = transactions.filter(t => {
            const d = new Date(t.date + "T00:00:00");
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        const cmExpenses = currentMonthTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const cmIncome = currentMonthTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

        const dailyBurn = cmExpenses / daysInMonthSoFar;
        const projectedExpense = dailyBurn * daysInMonth;
        const projectedBalance = cmIncome - projectedExpense - currentMonthTransactions.filter(t => t.type === 'saved').reduce((s, t) => s + t.amount, 0);

        // Savings Rate
        const savingsRate = cmIncome > 0 ? Math.round((currentMonthTransactions.filter(t => t.type === 'saved').reduce((s, t) => s + t.amount, 0) / cmIncome) * 100) : 0;

        // Reason Analysis
        const reasonMap: { [key: string]: number } = {};
        currentSet.filter(t => t.type === 'expense').forEach(t => {
            const reason = t.reason.split(' ')[0].toLowerCase();
            reasonMap[reason] = (reasonMap[reason] || 0) + t.amount;
        });
        const topReasons = Object.entries(reasonMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        // Daily Activity for Sparkline
        const last7Days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const dayTotal = transactions
                .filter(t => t.date === dateStr && t.type === 'expense')
                .reduce((s, t) => s + t.amount, 0);
            return { date: dateStr, amount: dayTotal };
        }).reverse();

        return {
            liquidBalance,
            totalSaved,
            dailyBurn,
            projectedBalance,
            savingsRate,
            topReasons,
            last7Days,
            incomeRatio: cmIncome > 0 ? (cmExpenses / cmIncome) * 100 : 0
        };
    }, [transactions, filteredTransactions]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortOrder("desc");
        }
    };

    const handleExport = () => {
        const headers = ["ID", "Date", "Amount", "Type", "Reason", "Description"];
        const csvContent = [
            headers.join(","),
            ...filteredTransactions.map(t => [
                t.id,
                t.date,
                t.amount,
                t.type,
                `"${t.reason.replace(/"/g, '""')}"`,
                `"${(t.description || "").replace(/"/g, '""')}"`
            ].join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `finance_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const resetFilters = () => {
        setSearchQuery("");
        setStartDate("");
        setEndDate("");
        setMinAmount("");
        setMaxAmount("");
        setTypeFilter("all");
    };

    return (
        <main className="app-container" style={{ maxWidth: '800px' }}>
            <header className="app-header">
                <div className="title-group-main">
                    <h1>ADVANCED ANALYTICS</h1>
                    <p className="subtitle">Insights & Deep Data Tools</p>
                </div>
                <nav>
                    <Link href="/" className="nav-link">
                        Back to Wallet
                    </Link>
                </nav>
            </header>

            {/* Filter Dashboard */}
            <section className="filter-dashboard">
                <div className="filter-header">
                    <h3>FILTERS & RANGE</h3>
                    <button className="reset-btn" onClick={resetFilters}>Reset All</button>
                </div>
                <div className="filter-grid">
                    <div className="filter-group">
                        <label>Search Reason/Desc</label>
                        <input
                            type="text"
                            placeholder="e.g. Coffee"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="filter-group">
                        <label>Type</label>
                        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                            <option value="all">All Types</option>
                            <option value="income">Income Only</option>
                            <option value="expense">Expense Only</option>
                            <option value="saved">Saved Only</option>
                        </select>
                    </div>
                    <div className="filter-group">
                        <label>From Date</label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
                    <div className="filter-group">
                        <label>To Date</label>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                    <div className="filter-group">
                        <label>Min Amount</label>
                        <input type="number" placeholder="0" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
                    </div>
                    <div className="filter-group">
                        <label>Max Amount</label>
                        <input type="number" placeholder="Any" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
                    </div>
                </div>
                <div className="filter-footer">
                    <div className="toggle-group">
                        <button
                            className={`toggle-btn ${!showAllMonths ? "active" : ""}`}
                            onClick={() => setShowAllMonths(false)}
                        >
                            Active Month
                        </button>
                        <button
                            className={`toggle-btn ${showAllMonths ? "active" : ""}`}
                            onClick={() => setShowAllMonths(true)}
                        >
                            All History
                        </button>
                    </div>
                    <button className="export-btn" onClick={handleExport}>
                        Export CSV ↓
                    </button>
                </div>
            </section>

            {/* Visual Insights */}
            {insights && (
                <section className="insights-grid">
                    <div className="insight-card highlight">
                        <div className="insight-header">
                            <span className="insight-title">End-of-Month Projection</span>
                            <span className="insight-tag">Estimate</span>
                        </div>
                        <div className="insight-main">
                            <div className={`insight-value ${insights.projectedBalance >= 0 ? 'income' : 'expense'}`}>
                                {formatCurrency(insights.projectedBalance)}
                            </div>
                            <div className="insight-subtext">Estimated net flow by end of month</div>
                        </div>
                        <div className="progress-container">
                            <div
                                className={`progress-bar ${insights.incomeRatio > 80 ? 'expense' : 'income'}`}
                                style={{ width: `${Math.min(100, insights.incomeRatio)}%` }}
                            />
                        </div>
                        <div className="insight-footer">
                            <span>Income/Expense Ratio: {insights.incomeRatio.toFixed(1)}%</span>
                        </div>
                    </div>

                    <div className="insight-card">
                        <div className="insight-header">
                            <span className="insight-title">Recent Activity (7d)</span>
                            <span className="insight-tag">Expenses</span>
                        </div>
                        <div className="sparkline-container">
                            {insights.last7Days.map((day, idx) => {
                                const max = Math.max(...insights.last7Days.map(d => d.amount), 1);
                                const height = (day.amount / max) * 100;
                                return (
                                    <div key={idx} className="sparkline-bar-wrapper" title={`${day.date}: ${formatCurrency(day.amount)}`}>
                                        <div className="sparkline-bar" style={{ height: `${height}%` }}></div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="insight-subtext">Last 7 days daily spending trend</div>
                    </div>

                    <div className="insight-card full-width">
                        <div className="insight-header">
                            <span className="insight-title">Spending Distribution by Reason</span>
                        </div>
                        <div className="category-bars">
                            {insights.topReasons.map(([reason, amount]) => {
                                const total = insights.topReasons[0][1];
                                const width = (amount / total) * 100;
                                return (
                                    <div key={reason} className="category-row">
                                        <div className="category-info">
                                            <span className="category-label">{reason.toUpperCase()}</span>
                                            <span className="category-val">{formatCurrency(amount)}</span>
                                        </div>
                                        <div className="progress-container-small">
                                            <div className="progress-bar accent" style={{ width: `${width}%` }}></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>
            )}

            <div className="section-header">
                <div className="title-group">
                    <h2>Filtered Results</h2>
                    <span className="view-indicator">
                        {filteredTransactions.length} Matches
                    </span>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                    Analyzing data...
                </div>
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
                            {filteredTransactions.map((t) => (
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

            <style jsx>{`
                .title-group-main {
                    margin-bottom: 24px;
                }
                .subtitle {
                    font-size: 0.875rem;
                    color: var(--text-muted);
                    font-weight: 500;
                    margin-top: 4px;
                }
                .filter-dashboard {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    padding: 24px;
                    margin-bottom: 32px;
                }
                .filter-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                .filter-header h3 {
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: var(--text-muted);
                    letter-spacing: 0.05em;
                }
                .reset-btn {
                    background: none;
                    border: none;
                    color: var(--accent);
                    font-size: 0.75rem;
                    font-weight: 600;
                    cursor: pointer;
                    text-decoration: underline;
                }
                .filter-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                    gap: 16px;
                    margin-bottom: 24px;
                }
                .filter-group {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .filter-group label {
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                }
                .filter-group input, .filter-group select {
                    background: var(--bg-input);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-sm);
                    padding: 8px 10px;
                    color: var(--text-primary);
                    font-size: 0.8125rem;
                    outline: none;
                }
                .filter-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-top: 16px;
                    border-top: 1px solid var(--border-color);
                }
                .export-btn {
                    background: var(--text-primary);
                    color: var(--bg-primary);
                    border: none;
                    padding: 8px 16px;
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all var(--transition);
                }
                .export-btn:hover {
                    opacity: 0.9;
                    transform: translateY(-1px);
                }
                .insight-card.highlight {
                    border-color: var(--accent);
                    background: rgba(56, 189, 248, 0.03);
                }
                .insight-card.full-width {
                    grid-column: 1 / -1;
                }
                .insight-footer {
                    margin-top: 8px;
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: var(--text-muted);
                }
                .sparkline-container {
                    display: flex;
                    align-items: flex-end;
                    gap: 4px;
                    height: 60px;
                    margin: 12px 0;
                }
                .sparkline-bar-wrapper {
                    flex: 1;
                    height: 100%;
                    display: flex;
                    align-items: flex-end;
                }
                .sparkline-bar {
                    width: 100%;
                    background: var(--accent);
                    border-radius: 2px 2px 0 0;
                    transition: height 0.3s ease;
                    opacity: 0.7;
                }
                .sparkline-bar:hover {
                    opacity: 1;
                }
                .category-bars {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    margin-top: 8px;
                }
                .category-row {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .category-info {
                    display: flex;
                    justify-content: space-between;
                    font-size: 0.75rem;
                    font-weight: 600;
                }
                .category-label {
                    color: var(--text-secondary);
                }
                .progress-container-small {
                    height: 4px;
                    background: var(--bg-secondary);
                    border-radius: 2px;
                    overflow: hidden;
                }
                .progress-bar.accent {
                    background: var(--accent);
                }
                @media (max-width: 600px) {
                    .filter-footer {
                        flex-direction: column;
                        gap: 16px;
                    }
                    .toggle-group, .export-btn {
                        width: 100%;
                    }
                    .export-btn {
                        padding: 12px;
                    }
                }
            `}</style>
        </main>
    );
}
