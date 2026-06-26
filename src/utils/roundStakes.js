function rowHasNumericSnapshot(row, key) {
    if (row?.[key] == null || row?.[key] === "") {
        return false;
    }
    const numeric = Number(row[key]);
    // 0 is treated as unset so bad/legacy rows still fall back to settings.
    return Number.isFinite(numeric) && numeric !== 0;
}

export function rowHasBuyInSnapshot(row) {
    return rowHasNumericSnapshot(row, "buyIn");
}

export function rowHasJackpotFeeSnapshot(row) {
    return rowHasNumericSnapshot(row, "jackpotFee");
}

export function rowHasBountyFeeSnapshot(row) {
    return rowHasNumericSnapshot(row, "bountyFee");
}

export function rowHasStakesSnapshot(row) {
    return rowHasBuyInSnapshot(row) && rowHasJackpotFeeSnapshot(row) && rowHasBountyFeeSnapshot(row);
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

export function getRowJackpotFee(row, settings) {
    if (rowHasJackpotFeeSnapshot(row)) {
        return Number(row.jackpotFee);
    }
    return Number(settings?.jackpot || 0);
}

export function getRowBountyFee(row, settings) {
    if (rowHasBountyFeeSnapshot(row)) {
        return Number(row.bountyFee);
    }
    return Number(settings?.bounty || 0);
}

export function freezeRowStakes(row, settings) {
    const next = { ...row };
    if (!rowHasBuyInSnapshot(row)) {
        next.buyIn = Number(settings?.buyIn || 0);
    }
    if (!rowHasJackpotFeeSnapshot(row)) {
        next.jackpotFee = Number(settings?.jackpot || 0);
    }
    if (!rowHasBountyFeeSnapshot(row)) {
        next.bountyFee = Number(settings?.bounty || 0);
    }
    return next;
}

export function withFrozenRowStakes(row, settings, players) {
    if (!rowHasGameplayData(row, players)) {
        return row;
    }
    return freezeRowStakes(row, settings);
}

export function applyRowStakesSnapshots(rows, settings, players) {
    return rows.map((row) => {
        if (rowHasGameplayData(row, players)) {
            return freezeRowStakes(row, settings);
        }
        return row;
    });
}

export function getRowPrizeBaseAmount(row, settings) {
    return getRowBuyIn(row, settings) - getRowJackpotFee(row, settings) - getRowBountyFee(row, settings);
}

export function getRowKoMoney(row, settings, players) {
    if (!row.date) {
        return "";
    }
    const attendanceCount = players.filter((player) => row.attendance?.[player.id]).length;
    if (attendanceCount <= 1) {
        return 0;
    }
    const rebuyCount = players.filter((player) => row.rebuys?.[player.id]).length;
    return ((attendanceCount + rebuyCount) / (attendanceCount - 1)) * getRowBountyFee(row, settings);
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

export function sumJackpotContributions(rows, players, settings) {
    return rows.reduce((sum, row) => {
        const jackpotFee = getRowJackpotFee(row, settings);
        const entries =
            players.filter((player) => row.attendance?.[player.id]).length +
            players.filter((player) => row.rebuys?.[player.id]).length;
        return sum + entries * jackpotFee;
    }, 0);
}

// Backward-compatible aliases
export const freezeRowBuyIn = freezeRowStakes;
export const withFrozenBuyIn = withFrozenRowStakes;
export const applyRowBuyInSnapshots = applyRowStakesSnapshots;
export const snapshotRowBuyIn = freezeRowStakes;
