export function getDefaultStakes(settings) {
    return {
        buyIn: Number(settings?.buyIn || 0),
        jackpotFee: Number(settings?.jackpot || 0),
        bountyFee: Number(settings?.bounty || 0)
    };
}

function readStakeValue(raw, fallback) {
    if (raw == null || raw === "") {
        return fallback;
    }
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function repairBuyIn(buyIn, fallback) {
    if (buyIn <= 0 && fallback > 0) {
        return fallback;
    }
    return buyIn;
}

function resolveLockedStakes(row, defaults) {
    if (Number(row.buyIn) <= 0 && defaults.buyIn > 0) {
        return defaults;
    }
    return {
        buyIn: repairBuyIn(readStakeValue(row.buyIn, defaults.buyIn), defaults.buyIn),
        jackpotFee: readStakeValue(row.jackpotFee, defaults.jackpotFee),
        bountyFee: readStakeValue(row.bountyFee, defaults.bountyFee)
    };
}

export function getRowStakes(row, settings) {
    const defaults = getDefaultStakes(settings);
    if (!row?.stakesLocked) {
        return defaults;
    }
    return resolveLockedStakes(row, defaults);
}

export function createLockedRoundStakes(settings) {
    const stakes = getDefaultStakes(settings);
    return {
        stakesLocked: true,
        buyIn: stakes.buyIn,
        jackpotFee: stakes.jackpotFee,
        bountyFee: stakes.bountyFee
    };
}

export function rowHasGameplayData(row, players) {
    return players.some((player) => row.attendance?.[player.id]);
}

export function rowHasBuyInSnapshot(row) {
    return Boolean(row?.stakesLocked);
}

export function rowHasJackpotFeeSnapshot(row) {
    return Boolean(row?.stakesLocked);
}

export function rowHasBountyFeeSnapshot(row) {
    return Boolean(row?.stakesLocked);
}

export function rowHasStakesSnapshot(row) {
    return Boolean(row?.stakesLocked);
}

export function getRowBuyIn(row, settings) {
    return getRowStakes(row, settings).buyIn;
}

export function getRowJackpotFee(row, settings) {
    return getRowStakes(row, settings).jackpotFee;
}

export function getRowBountyFee(row, settings) {
    return getRowStakes(row, settings).bountyFee;
}

export function lockRowStakes(row, settings) {
    const defaults = getDefaultStakes(settings);
    const stakes = resolveLockedStakes(row, defaults);

    return {
        ...row,
        stakesLocked: true,
        buyIn: stakes.buyIn,
        jackpotFee: stakes.jackpotFee,
        bountyFee: stakes.bountyFee
    };
}

export function freezeRowStakes(row, settings) {
    return lockRowStakes(row, settings);
}

export function withFrozenRowStakes(row, settings, players) {
    if (!rowHasGameplayData(row, players)) {
        return row;
    }
    return lockRowStakes(row, settings);
}

function rowShouldLockStakes(row, players) {
    return (
        rowHasGameplayData(row, players) ||
        row.stakesLocked ||
        row.buyIn != null ||
        row.jackpotFee != null ||
        row.bountyFee != null
    );
}

export function applyRowStakesSnapshots(rows, settings, players) {
    return rows.map((row) => {
        if (rowShouldLockStakes(row, players)) {
            return lockRowStakes(row, settings);
        }
        return row;
    });
}

export function getRowPrizeBaseAmount(row, settings) {
    const { buyIn, jackpotFee, bountyFee } = getRowStakes(row, settings);
    return buyIn - jackpotFee - bountyFee;
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

function getPlayerRankPoints(row, player, rankPoints) {
    const rank = row.rank?.[player.id] ?? "NA";
    if (!row.attendance?.[player.id] || rank === "NA") {
        return 0;
    }
    const rankNumber = Number(String(rank).replace("Top ", ""));
    return Number(rankPoints?.[rankNumber] ?? 0);
}

export function computeProfitByRound(rows, players, settings, variant = "jpbt") {
    const rankPoints = settings?.rankPoints ?? {};

    return Object.fromEntries(
        (rows ?? []).map((row) => {
            const baseAmount =
                variant === "jpbt" ? getRowPrizeBaseAmount(row, settings) : getRowBuyIn(row, settings);
            const attendeeCount = players.filter((player) => row.attendance?.[player.id]).length;
            const rebuyCount = players.filter((player) => row.rebuys?.[player.id]).length;
            const pool = (attendeeCount + rebuyCount) * baseAmount;

            const pointsByPlayer = Object.fromEntries(
                players.map((player) => [player.id, getPlayerRankPoints(row, player, rankPoints)])
            );
            const totalPoints = Object.values(pointsByPlayer).reduce((sum, point) => sum + point, 0);

            const byPlayer = Object.fromEntries(
                players.map((player) => {
                    if (!row.attendance?.[player.id]) {
                        return [player.id, ""];
                    }
                    const playerPoints = pointsByPlayer[player.id] ?? 0;
                    const winAmount = totalPoints > 0 ? (pool * playerPoints) / totalPoints : 0;
                    const totalCost = baseAmount + (row.rebuys?.[player.id] ? baseAmount : 0);
                    return [player.id, winAmount - totalCost];
                })
            );

            return [row.round, byPlayer];
        })
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
export const withFrozenBuyIn = withFrozenRowStakes;
export const applyRowBuyInSnapshots = applyRowStakesSnapshots;
export const snapshotRowBuyIn = lockRowStakes;
export const freezeRowBuyIn = lockRowStakes;
