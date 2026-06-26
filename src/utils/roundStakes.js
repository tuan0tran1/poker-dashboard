export function rowHasBuyInSnapshot(row) {
    return row?.buyIn != null && row?.buyIn !== "" && Number.isFinite(Number(row.buyIn));
}

export function rowHasGameplayData(row, players) {
    return players.some((player) => row.attendance?.[player.id]);
}

export function getRowBuyIn(row, settings) {
    if (rowHasBuyInSnapshot(row)) {
        return Number(row.buyIn);
    }
    return Number(settings?.buyIn || 0);
}

export function freezeRowBuyIn(row, settings) {
    if (rowHasBuyInSnapshot(row)) {
        return row;
    }
    return {
        ...row,
        buyIn: Number(settings?.buyIn || 0)
    };
}

export function withFrozenBuyIn(row, settings, players) {
    if (!rowHasGameplayData(row, players)) {
        return row;
    }
    return freezeRowBuyIn(row, settings);
}

export function snapshotRowBuyIn(row, settings) {
    return freezeRowBuyIn(row, settings);
}

export function applyRowBuyInSnapshots(rows, settings, players) {
    return rows.map((row) => {
        if (rowHasBuyInSnapshot(row)) {
            return row;
        }
        if (rowHasGameplayData(row, players)) {
            return freezeRowBuyIn(row, settings);
        }
        return row;
    });
}

export function getRowPrizeBaseAmount(row, settings) {
    return (
        getRowBuyIn(row, settings) -
        Number(settings?.jackpot || 0) -
        Number(settings?.bounty || 0)
    );
}

export function sumPlayerBuyIn(rows, playerId, settings) {
    return rows.reduce((sum, row) => {
        if (!row.attendance?.[playerId]) return sum;
        const rowBuyIn = getRowBuyIn(row, settings);
        return sum + rowBuyIn + (row.rebuys?.[playerId] ? rowBuyIn : 0);
    }, 0);
}

export function sumPlayerPrizePoolContribution(rows, playerId, settings) {
    return rows.reduce((sum, row) => {
        if (!row.attendance?.[playerId]) return sum;
        const baseAmount = getRowPrizeBaseAmount(row, settings);
        return sum + baseAmount + (row.rebuys?.[playerId] ? baseAmount : 0);
    }, 0);
}
