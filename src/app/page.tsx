"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import type { Transaction, TransactionFormData } from "@/types/transaction";

const INITIAL_FORM: TransactionFormData = {
  date: new Date().toISOString().split("T")[0],
  amount: "",
  type: "expense",
  reason: "",
  description: "",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getDay(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.getDate().toString().padStart(2, '0');
}

function getMonthYear(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [form, setForm] = useState<TransactionFormData>(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [showAllMonths, setShowAllMonths] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "table">("list");
  const [menuOpen, setMenuOpen] = useState(false);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch("/api/transactions");
      if (!res.ok) throw new Error("Failed to load transactions");
      const data: Transaction[] = await res.json();
      setTransactions(data);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = () => setMenuOpen(false);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [menuOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date || !form.amount || !form.reason) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to add transaction");
      }

      setForm({ ...INITIAL_FORM, date: form.date });
      setShowForm(false);
      await fetchTransactions();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this transaction?")) return;
    try {
      const res = await fetch(`/api/transactions?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      await fetchTransactions();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Could not delete transaction";
      setError(message);
    }
  };

  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalSaved = transactions
    .filter((t) => t.type === "saved")
    .reduce((sum, t) => sum + t.amount, 0);

  const balanceLiquid = totalIncome - totalExpense - totalSaved;

  // Monthly stats for the "Flow" card
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const currentMonthKey = getMonthYear(now.toISOString().split('T')[0]);

  const monthlyFlow = transactions.filter(t => {
    const d = new Date(t.date + "T00:00:00");
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const monthlyIncome = monthlyFlow
    .filter(t => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const monthlyExpense = monthlyFlow
    .filter(t => t.type === "expense" || t.type === "saved") // Saved acts as a deduction from monthly flow
    .reduce((sum, t) => sum + t.amount, 0);

  // Group transactions by month
  const groupedTransactions = useMemo(() => {
    const groups: { [key: string]: { transactions: Transaction[], total: number } } = {};

    transactions.forEach(t => {
      const monthYear = getMonthYear(t.date);
      if (!groups[monthYear]) {
        groups[monthYear] = { transactions: [], total: 0 };
      }
      groups[monthYear].transactions.push(t);
      // Monthly total (Net liquid flow)
      groups[monthYear].total += (t.type === 'income' ? t.amount : -t.amount);
    });

    let entries = Object.entries(groups).sort((a, b) => {
      const dateA = new Date(a[1].transactions[0].date);
      const dateB = new Date(b[1].transactions[0].date);
      return dateB.getTime() - dateA.getTime();
    });

    // Default to current month only if not wanting to show all
    if (!showAllMonths) {
      entries = entries.filter(([key]) => key === currentMonthKey);
    }

    return entries;
  }, [transactions, showAllMonths, currentMonthKey]);

  return (
    <main className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1>MONEY TRACKER</h1>
        <nav>
          <Link href="/data-tools" className="nav-link">
            Data Tools
          </Link>
        </nav>
      </header>

      {/* Summary */}
      <section className="summary-row">
        <div className="summary-card">
          <h3>Flow (This Month)</h3>
          <div className="card-content">
            <div className="stat-item">
              <div className="stat-label">In</div>
              <div className="stat-value income">{formatCurrency(monthlyIncome)}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Out</div>
              <div className="stat-value expense">−{formatCurrency(monthlyExpense)}</div>
            </div>
          </div>
        </div>

        <div className="summary-card">
          <h3>Balance (Overall)</h3>
          <div className="card-content">
            <div className="stat-item">
              <div className="stat-label">Savings</div>
              <div className="stat-value saved">{formatCurrency(totalSaved)}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Liquid</div>
              <div className="stat-value liquid">{formatCurrency(balanceLiquid)}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Add Section Header */}
      <div className="section-header">
        <div className="title-group">
          <h2>Transactions</h2>
          <span className="view-indicator">
            {showAllMonths ? "All History" : "Current Month"}
          </span>
        </div>
        <div className="header-actions">
          <button
            className={`toggle-add-btn ${showForm ? "active" : ""}`}
            onClick={() => setShowForm(!showForm)}
            title={showForm ? "Cancel" : "Add New"}
          >
            {showForm ? "✕" : "+"}
          </button>
          <div className="menu-container">
            <button
              className="menu-trigger"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="menu-dropdown">
                <button
                  className={`menu-item ${showAllMonths ? "active" : ""}`}
                  onClick={() => setShowAllMonths(!showAllMonths)}
                >
                  {showAllMonths ? "Current month only" : "Show all months"}
                </button>
                <button
                  className={`menu-item ${viewMode === "table" ? "active" : ""}`}
                  onClick={() => setViewMode(viewMode === "list" ? "table" : "list")}
                >
                  {viewMode === "list" ? "Table View" : "List View"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="error-toast" role="alert">
          {error}
        </div>
      )}

      {/* Form Wrapper */}
      <div className={`form-wrapper ${showForm ? 'visible' : 'hidden'}`}>
        <form className="form-card" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="field-date">Date</label>
              <input
                id="field-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="field-amount">Amount (IDR)</label>
              <input
                id="field-amount"
                type="number"
                min="0"
                step="1000"
                placeholder="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </div>

            <div className="form-group full-width">
              <label>Type</label>
              <div className="type-toggle">
                <button
                  type="button"
                  className={`type-btn ${form.type === "income" ? "income-active" : ""}`}
                  onClick={() => setForm({ ...form, type: "income" })}
                >
                  INCOME
                </button>
                <button
                  type="button"
                  className={`type-btn ${form.type === "expense" ? "expense-active" : ""}`}
                  onClick={() => setForm({ ...form, type: "expense" })}
                >
                  EXPENSE
                </button>
                <button
                  type="button"
                  className={`type-btn ${form.type === "saved" ? "saved-active" : ""}`}
                  onClick={() => setForm({ ...form, type: "saved" })}
                >
                  SAVED
                </button>
              </div>
            </div>

            <div className="form-group full-width">
              <label htmlFor="field-reason">Reason</label>
              <input
                id="field-reason"
                type="text"
                placeholder="Lunch, Salary..."
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                required
              />
            </div>

            <div className="form-group full-width">
              <label htmlFor="field-description">Description</label>
              <textarea
                id="field-description"
                placeholder="Optional details"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>

            <button
              type="submit"
              className="submit-btn"
              disabled={submitting}
            >
              {submitting ? "SAVING..." : "SAVE TRANSACTION"}
            </button>
          </div>
        </form>
      </div>

      {/* Transactions History */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          Loading...
        </div>
      ) : groupedTransactions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          No transactions {showAllMonths ? "" : "this month."}
        </div>
      ) : viewMode === "list" ? (
        groupedTransactions.map(([monthYear, data]) => (
          <section key={monthYear} className="month-group">
            <header className="month-header">
              <h3 className="month-title">{monthYear.toUpperCase()}</h3>
              <div className="month-total">
                TOTAL <span className="val">{formatCurrency(data.total)}</span>
              </div>
            </header>

            <div className="transaction-list">
              {data.transactions.map((t) => (
                <div key={t.id} className="transaction-item">
                  <div className="t-main">
                    <div className="t-date">{getDay(t.date)}</div>
                    <div className="t-info">
                      <div className="t-reason">{t.reason}</div>
                      {t.description && <div className="t-desc">{t.description}</div>}
                    </div>
                  </div>

                  <div className="t-amount-wrapper">
                    <div className={`t-amount ${t.type}`}>
                      {t.type === "income" ? "+" : t.type === "expense" ? "−" : "↓"}
                      {formatCurrency(t.amount)}
                    </div>
                    <button
                      className="delete-btn"
                      onClick={() => handleDelete(t.id)}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reason</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {groupedTransactions.flatMap(([_, data]) =>
                data.transactions.map(t => (
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
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
