export const STAKE_DEFAULTS = {
    buyIn: 200000,
    jackpot: 10000,
    bounty: 10000
};

const DEFAULT_BUY_IN = STAKE_DEFAULTS.buyIn;

export function readPositiveBuyIn(value, fallback = DEFAULT_BUY_IN) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
    }
    return fallback;
}

export function readNonNegativeStake(value, fallback = 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) {
        return numeric;
    }
    return fallback;
}

export function resolveStakeSettings(settings, defaults = STAKE_DEFAULTS) {
    return {
        ...settings,
        buyIn: readPositiveBuyIn(settings?.buyIn, defaults.buyIn),
        jackpot: readNonNegativeStake(settings?.jackpot, defaults.jackpot),
        bounty: readNonNegativeStake(settings?.bounty, defaults.bounty)
    };
}

export function rowHasGameplayData(row, players) {
    return players.some((player) => row.attendance?.[player.id]);
}

export function rowHasBuyInSnapshot(row) {
    if (row?.buyIn == null || row?.buyIn === "") {
        return false;
    }
    const numeric = Number(row.buyIn);
    return Number.isFinite(numeric) && numeric > 0;
}

export function rowHasJackpotFeeSnapshot(row) {
    if (row?.jackpotFee == null || row?.jackpotFee === "") {
        return false;
    }
    const numeric = Number(row.jackpotFee);
    return Number.isFinite(numeric) && numeric >= 0;
}

export function rowHasBountyFeeSnapshot(row) {
    if (row?.bountyFee == null || row?.bountyFee === "") {
        return false;
    }
    const numeric = Number(row.bountyFee);
    return Number.isFinite(numeric) && numeric >= 0;
}

export function rowHasStakesSnapshot(row) {
    return rowHasBuyInSnapshot(row) && rowHasJackpotFeeSnapshot(row) && rowHasBountyFeeSnapshot(row);
}

function isJpbtSettings(settings) {
    return "jackpot" in (settings ?? {});
}

function repairRowStakes(buyIn, jackpotFee, bountyFee, resolved) {
    const normalizedBuyIn = readPositiveBuyIn(buyIn, resolved.buyIn);
    let nextJackpotFee = readNonNegativeStake(jackpotFee, resolved.jackpot);
    let nextBountyFee = readNonNegativeStake(bountyFee, resolved.bounty);

    if (normalizedBuyIn - nextJackpotFee - nextBountyFee > 0) {
        return {
            buyIn: normalizedBuyIn,
            jackpotFee: nextJackpotFee,
            bountyFee: nextBountyFee
        };
    }

    const resolvedBase = resolved.buyIn - resolved.jackpot - resolved.bounty;
    if (resolvedBase > 0) {
        return {
            buyIn: normalizedBuyIn,
            jackpotFee: resolved.jackpot,
            bountyFee: resolved.bounty
        };
    }

    return {
        buyIn: readPositiveBuyIn(normalizedBuyIn, STAKE_DEFAULTS.buyIn),
        jackpotFee: STAKE_DEFAULTS.jackpot,
        bountyFee: STAKE_DEFAULTS.bounty
    };
}

export function getRowStakes(row, settings) {
    const resolved = resolveStakeSettings(settings);

    if (!isJpbtSettings(settings)) {
        return {
            buyIn: rowHasBuyInSnapshot(row) ? readPositiveBuyIn(row.buyIn, resolved.buyIn) : resolved.buyIn,
            jackpotFee: 0,
            bountyFee: 0
        };
    }

    const buyIn = rowHasBuyInSnapshot(row) ? readPositiveBuyIn(row.buyIn, resolved.buyIn) : resolved.buyIn;
    const jackpotFee = rowHasJackpotFeeSnapshot(row)
        ? readNonNegativeStake(row.jackpotFee, resolved.jackpot)
        : resolved.jackpot;
    const bountyFee = rowHasBountyFeeSnapshot(row)
        ? readNonNegativeStake(row.bountyFee, resolved.bounty)
        : resolved.bounty;

    return repairRowStakes(buyIn, jackpotFee, bountyFee, resolved);
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

function stripLegacyFlag(row) {
    if (!row || typeof row !== "object") {
        return row;
    }
    const { stakesLocked, ...rest } = row;
    return rest;
}

export function lockRowStakes(row, settings) {
    const resolved = resolveStakeSettings(settings);
    const next = stripLegacyFlag({ ...row });

    if (!isJpbtSettings(settings)) {
        return {
            ...next,
            buyIn: rowHasBuyInSnapshot(next) ? readPositiveBuyIn(next.buyIn, resolved.buyIn) : resolved.buyIn
        };
    }

    const buyIn = rowHasBuyInSnapshot(next) ? readPositiveBuyIn(next.buyIn, resolved.buyIn) : resolved.buyIn;
    const jackpotFee = rowHasJackpotFeeSnapshot(next)
        ? readNonNegativeStake(next.jackpotFee, resolved.jackpot)
        : resolved.jackpot;
    const bountyFee = rowHasBountyFeeSnapshot(next)
        ? readNonNegativeStake(next.bountyFee, resolved.bounty)
        : resolved.bounty;
    const repaired = repairRowStakes(buyIn, jackpotFee, bountyFee, resolved);

    return {
        ...next,
        buyIn: repaired.buyIn,
        jackpotFee: repaired.jackpotFee,
        bountyFee: repaired.bountyFee
    };
}

export function freezeRowStakes(row, settings) {
    return lockRowStakes(row, settings);
}

export function withFrozenRowStakes(row, settings, players) {
    if (!rowHasGameplayData(row, players)) {
        return stripLegacyFlag(row);
    }
    return lockRowStakes(row, settings);
}

function rowShouldLockStakes(row, players) {
    return (
        rowHasGameplayData(row, players) ||
        rowHasBuyInSnapshot(row) ||
        rowHasJackpotFeeSnapshot(row) ||
        rowHasBountyFeeSnapshot(row)
    );
}

export function applyRowStakesSnapshots(rows, settings, players) {
    return (rows ?? []).map((row) => {
        if (rowShouldLockStakes(row, players)) {
            return lockRowStakes(row, settings);
        }
        return stripLegacyFlag(row);
    });
}

export function createLockedRoundStakes(settings) {
    const resolved = resolveStakeSettings(settings);
    return {
        buyIn: resolved.buyIn,
        jackpotFee: resolved.jackpot,
        bountyFee: resolved.bounty
    };
}

export function getRowPrizeBaseAmount(row, settings) {
    const resolved = resolveStakeSettings(settings);
    const { buyIn, jackpotFee, bountyFee } = getRowStakes(row, resolved);
    const baseAmount = buyIn - jackpotFee - bountyFee;
    const defaultBase = resolved.buyIn - resolved.jackpot - resolved.bounty;
    return baseAmount > 0 ? baseAmount : Math.max(defaultBase, 0);
}

export function getRowKoMoney(row, settings, players) {
    if (!row?.date) {
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

function getRoundEntryStake(row, settings, variant = "jpbt") {
    if (variant === "omaha") {
        return getRowBuyIn(row, settings);
    }
    return getRowPrizeBaseAmount(row, settings);
}

function getRoundAttendanceCount(row, players) {
    return players.filter((player) => row.attendance?.[player.id]).length;
}

function getRoundRebuyCount(row, players) {
    return players.filter((player) => row.rebuys?.[player.id]).length;
}

function getRoundProfitPool(row, players, settings, variant = "jpbt") {
    const entryStake = getRoundEntryStake(row, settings, variant);
    return (getRoundAttendanceCount(row, players) + getRoundRebuyCount(row, players)) * entryStake;
}

function getRoundTotalTopPoints(row, players, rankPoints) {
    return players.reduce((sum, player) => sum + getPlayerRankPoints(row, player, rankPoints), 0);
}

/** profit = pool / tổng điểm top * điểm top người đó − entryStake − rebuy (nếu có) */
export function computePlayerRoundProfit(row, player, players, settings, variant = "jpbt") {
    if (!row.attendance?.[player.id]) {
        return "";
    }

    const resolved = resolveStakeSettings(settings);
    const rankPoints = resolved.rankPoints ?? {};
    const entryStake = getRoundEntryStake(row, resolved, variant);
    const pool = getRoundProfitPool(row, players, resolved, variant);
    const totalTopPoints = getRoundTotalTopPoints(row, players, rankPoints);
    const playerTopPoints = getPlayerRankPoints(row, player, rankPoints);

    const winAmount = totalTopPoints > 0 ? (pool / totalTopPoints) * playerTopPoints : 0;
    const rebuyCost = row.rebuys?.[player.id] ? entryStake : 0;

    return winAmount - entryStake - rebuyCost;
}

export function computeProfitByRound(rows, players, settings, variant = "jpbt") {
    const resolved = resolveStakeSettings(settings);

    return Object.fromEntries(
        (rows ?? []).map((row) => [
            row.round,
            Object.fromEntries(
                players.map((player) => [
                    player.id,
                    computePlayerRoundProfit(row, player, players, resolved, variant)
                ])
            )
        ])
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
        const entryStake = getRowPrizeBaseAmount(row, settings);
        return sum + entryStake + (row.rebuys?.[playerId] ? entryStake : 0);
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
export const freezeRowBuyIn = lockRowStakes;
export const snapshotRowBuyIn = lockRowStakes;
