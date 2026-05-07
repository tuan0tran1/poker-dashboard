import { useState } from "react";
import { formatCurrency } from "../utils/finance";

const emptyForm = { date: "", from: "", to: "", amount: "" };

export default function TransactionTable({ transactions, playersById, players, onCreate, onUpdate, onDelete }) {
    const [form, setForm] = useState(emptyForm);
    const [editingId, setEditingId] = useState(null);
    const [editingForm, setEditingForm] = useState(emptyForm);
    const [error, setError] = useState("");

    const startEdit = (transaction) => {
        setEditingId(transaction.id);
        setEditingForm({
            date: transaction.date,
            from: String(transaction.from),
            to: String(transaction.to),
            amount: String(transaction.amount)
        });
    };

    return (
        <div className="card">
            <h2>Giao dịch</h2>
            <div className="editor-block">
                <h3>Thêm giao dịch</h3>
                <div className="form-grid form-grid-4">
                    <input
                        type="date"
                        value={form.date}
                        onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                    />
                    <select
                        value={form.from}
                        onChange={(event) => setForm((prev) => ({ ...prev, from: event.target.value }))}
                    >
                        <option value="">Người trả</option>
                        {players.map((player) => (
                            <option key={player.id} value={player.id}>
                                {player.name}
                            </option>
                        ))}
                    </select>
                    <select
                        value={form.to}
                        onChange={(event) => setForm((prev) => ({ ...prev, to: event.target.value }))}
                    >
                        <option value="">Người nhận</option>
                        {players.map((player) => (
                            <option key={player.id} value={player.id}>
                                {player.name}
                            </option>
                        ))}
                    </select>
                    <input
                        type="number"
                        placeholder="Số tiền"
                        value={form.amount}
                        onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                    />
                </div>
                <div className="row-actions">
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            if (!form.date || !form.from || !form.to || !form.amount) {
                                setError("Vui lòng nhập đủ thông tin giao dịch.");
                                return;
                            }
                            if (Number(form.from) === Number(form.to)) {
                                setError("Người trả và người nhận phải khác nhau.");
                                return;
                            }
                            if (Number(form.amount) <= 0) {
                                setError("Số tiền phải lớn hơn 0.");
                                return;
                            }
                            onCreate({
                                date: form.date,
                                from: Number(form.from),
                                to: Number(form.to),
                                amount: Number(form.amount)
                            });
                            setForm(emptyForm);
                            setError("");
                        }}
                    >
                        Thêm
                    </button>
                </div>
                {error && <p className="error-text">{error}</p>}
            </div>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Người trả</th>
                        <th>Người nhận</th>
                        <th>Số tiền</th>
                        <th>Hành động</th>
                    </tr>
                </thead>
                <tbody>
                    {transactions.map((transaction) => (
                        <tr key={transaction.id}>
                            <td>
                                {editingId === transaction.id ? (
                                    <input
                                        type="date"
                                        value={editingForm.date}
                                        onChange={(event) =>
                                            setEditingForm((prev) => ({ ...prev, date: event.target.value }))
                                        }
                                    />
                                ) : (
                                    transaction.date
                                )}
                            </td>
                            <td>
                                {editingId === transaction.id ? (
                                    <select
                                        value={editingForm.from}
                                        onChange={(event) =>
                                            setEditingForm((prev) => ({ ...prev, from: event.target.value }))
                                        }
                                    >
                                        {players.map((player) => (
                                            <option key={player.id} value={player.id}>
                                                {player.name}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    playersById.get(transaction.from)?.name ?? transaction.from
                                )}
                            </td>
                            <td>
                                {editingId === transaction.id ? (
                                    <select
                                        value={editingForm.to}
                                        onChange={(event) =>
                                            setEditingForm((prev) => ({ ...prev, to: event.target.value }))
                                        }
                                    >
                                        {players.map((player) => (
                                            <option key={player.id} value={player.id}>
                                                {player.name}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    playersById.get(transaction.to)?.name ?? transaction.to
                                )}
                            </td>
                            <td>
                                {editingId === transaction.id ? (
                                    <input
                                        type="number"
                                        value={editingForm.amount}
                                        onChange={(event) =>
                                            setEditingForm((prev) => ({ ...prev, amount: event.target.value }))
                                        }
                                    />
                                ) : (
                                    formatCurrency(transaction.amount)
                                )}
                            </td>
                            <td>
                                {editingId === transaction.id ? (
                                    <div className="row-actions">
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => {
                                                if (!editingForm.date || !editingForm.from || !editingForm.to || !editingForm.amount) {
                                                    setError("Vui lòng nhập đủ thông tin giao dịch.");
                                                    return;
                                                }
                                                if (Number(editingForm.from) === Number(editingForm.to)) {
                                                    setError("Người trả và người nhận phải khác nhau.");
                                                    return;
                                                }
                                                if (Number(editingForm.amount) <= 0) {
                                                    setError("Số tiền phải lớn hơn 0.");
                                                    return;
                                                }
                                                onUpdate(transaction.id, {
                                                    date: editingForm.date,
                                                    from: Number(editingForm.from),
                                                    to: Number(editingForm.to),
                                                    amount: Number(editingForm.amount)
                                                });
                                                setEditingId(null);
                                                setError("");
                                            }}
                                        >
                                            Lưu
                                        </button>
                                        <button className="btn" onClick={() => setEditingId(null)}>
                                            Hủy
                                        </button>
                                    </div>
                                ) : (
                                    <div className="row-actions">
                                        <button className="btn" onClick={() => startEdit(transaction)}>
                                            Sửa
                                        </button>
                                        <button className="btn btn-danger" onClick={() => onDelete(transaction.id)}>
                                            Xóa
                                        </button>
                                    </div>
                                )}
                            </td>
                        </tr>
                    ))}
                    {transactions.length === 0 && (
                        <tr>
                            <td colSpan={5}>Chưa có giao dịch.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
