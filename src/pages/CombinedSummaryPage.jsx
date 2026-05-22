import { useMemo } from "react";
import { buildCombinedNetRows } from "../lib/workspaceSummary";
import { formatCurrency } from "../utils/finance";

export default function CombinedSummaryPage({ players, refreshKey = 0 }) {
    const combined = useMemo(() => buildCombinedNetRows(players, refreshKey), [players, refreshKey]);

    return (
        <div className="card combined-summary-card">
            <h2>Tổng kết</h2>
            <p className="combined-summary-note">
                Net lấy từ tab Tổng kết của Omaha và JP + BT (dữ liệu đã lưu trên máy / cloud).
            </p>
            <table className="data-table summary-table combined-net-table">
                <thead>
                    <tr>
                        <th>Người chơi</th>
                        <th>Net Omaha</th>
                        <th>Net JP + BT</th>
                        <th>Tổng net</th>
                    </tr>
                </thead>
                <tbody>
                    {combined.rows.map((row) => (
                        <tr key={row.playerId}>
                            <td>{row.playerName}</td>
                            <td className={row.omahaNet >= 0 ? "text-positive" : "text-negative"}>
                                {formatCurrency(row.omahaNet)}
                            </td>
                            <td className={row.jpbtNet >= 0 ? "text-positive" : "text-negative"}>
                                {formatCurrency(row.jpbtNet)}
                            </td>
                            <td className={row.totalNet >= 0 ? "text-positive" : "text-negative"}>
                                <strong>{formatCurrency(row.totalNet)}</strong>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="summary-grid combined-summary-grid">
                <div>Check Omaha: {formatCurrency(combined.omahaCheck)}</div>
                <div>Check JP + BT: {formatCurrency(combined.jpbtCheck)}</div>
                <div className="combined-total-net">
                    <span>Tổng net tất cả</span>
                    <strong className={combined.totalNet >= 0 ? "text-positive" : "text-negative"}>
                        {formatCurrency(combined.totalNet)}
                    </strong>
                </div>
            </div>
        </div>
    );
}
