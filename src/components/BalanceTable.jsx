import { formatCurrency } from "../utils/finance";

export default function BalanceTable({ balances }) {
    return (
        <div className="card">
            <h2>Tổng kết tiền</h2>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Người chơi</th>
                        <th>Số dư</th>
                    </tr>
                </thead>
                <tbody>
                    {balances.map((balance) => (
                        <tr key={balance.playerId}>
                            <td>{balance.playerName}</td>
                            <td className={balance.amount >= 0 ? "text-positive" : "text-negative"}>
                                {formatCurrency(balance.amount)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
