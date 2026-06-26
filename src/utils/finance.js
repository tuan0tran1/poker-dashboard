export function calculateBalance(players, transactions) {
    const totals = new Map(players.map((player) => [player.id, 0]));

    transactions.forEach((transaction) => {
        totals.set(transaction.from, (totals.get(transaction.from) ?? 0) - transaction.amount);
        totals.set(transaction.to, (totals.get(transaction.to) ?? 0) + transaction.amount);
    });

    return players
        .map((player) => ({
            playerId: player.id,
            playerName: player.name,
            amount: totals.get(player.id) ?? 0
        }))
        .sort((a, b) => b.amount - a.amount);
}

export function formatCurrency(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value)) return "0";
    return Math.round(value).toLocaleString("vi-VN");
}

export function formatRoundProfit(value) {
    if (value === "" || value == null) {
        return "";
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return "";
    }
    return formatCurrency(numeric);
}
