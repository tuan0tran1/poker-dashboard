export const OMAHA_STORAGE_KEY = "omaha-workspace-v1";
export const JPBT_STORAGE_KEY = "jpbt-workspace-v1";

export function loadWorkspace(storageKey) {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function computeProfitByRoundOmaha(players, rows, settings) {
    const baseAmount = Number(settings?.buyIn || 0);

    return Object.fromEntries(
        (rows ?? []).map((row) => {
            const attendeeCount = players.filter((player) => row.attendance?.[player.id]).length;
            const rebuyCount = players.filter((player) => row.rebuys?.[player.id]).length;
            const pool = (attendeeCount + rebuyCount) * baseAmount;

            const pointsByPlayer = Object.fromEntries(
                players.map((player) => {
                    const rank = row.rank?.[player.id] ?? "NA";
                    if (!row.attendance?.[player.id] || rank === "NA") {
                        return [player.id, 0];
                    }
                    const rankNumber = Number(String(rank).replace("Top ", ""));
                    return [player.id, Number(settings?.rankPoints?.[rankNumber] ?? 0)];
                })
            );
            const totalPoints = Object.values(pointsByPlayer).reduce((sum, point) => sum + point, 0);

            const byPlayer = Object.fromEntries(
                players.map((player) => {
                    const joinedAttendance = Boolean(row.attendance?.[player.id]);
                    const joinedRebuy = Boolean(row.rebuys?.[player.id]);
                    if (!joinedAttendance) {
                        return [player.id, ""];
                    }
                    const playerPoints = pointsByPlayer[player.id] ?? 0;
                    const winAmount = totalPoints > 0 ? (pool * playerPoints) / totalPoints : 0;
                    const totalCost = baseAmount + (joinedRebuy ? baseAmount : 0);
                    return [player.id, winAmount - totalCost];
                })
            );

            return [row.round, byPlayer];
        })
    );
}

export function computeOmahaSummary(workspace) {
    const players =
        Array.isArray(workspace?.players) && workspace.players.length > 0 ? workspace.players : [];
    const rows = Array.isArray(workspace?.rows) ? workspace.rows : [];
    const settings = workspace?.settings ?? {};
    if (players.length === 0) {
        return { players: [], check: 0 };
    }

    const profitByRound = computeProfitByRoundOmaha(players, rows, settings);
    const totalProfit = Object.fromEntries(players.map((player) => [player.id, 0]));

    rows.forEach((row) => {
        players.forEach((player) => {
            const p = Number(profitByRound[row.round]?.[player.id] ?? 0);
            if (!Number.isNaN(p)) {
                totalProfit[player.id] += p;
            }
        });
    });

    const withNet = players.map((player) => ({
        playerId: player.id,
        playerName: player.name,
        net: totalProfit[player.id] ?? 0
    }));

    return {
        players: withNet,
        check: withNet.reduce((sum, row) => sum + row.net, 0)
    };
}

function computeProfitByRoundJpbt(players, rows, settings) {
    const baseAmount =
        Number(settings?.buyIn || 0) - Number(settings?.jackpot || 0) - Number(settings?.bounty || 0);

    return Object.fromEntries(
        (rows ?? []).map((row) => {
            const attendeeCount = players.filter((player) => row.attendance?.[player.id]).length;
            const rebuyCount = players.filter((player) => row.rebuys?.[player.id]).length;
            const pool = attendeeCount * baseAmount + rebuyCount * baseAmount;

            const pointsByPlayer = Object.fromEntries(
                players.map((player) => {
                    const rank = row.rank?.[player.id] ?? "NA";
                    if (!row.attendance?.[player.id] || rank === "NA") {
                        return [player.id, 0];
                    }
                    const rankNumber = Number(String(rank).replace("Top ", ""));
                    return [player.id, Number(settings?.rankPoints?.[rankNumber] ?? 0)];
                })
            );
            const totalPoints = Object.values(pointsByPlayer).reduce((sum, point) => sum + point, 0);

            const byPlayer = Object.fromEntries(
                players.map((player) => {
                    const joinedAttendance = Boolean(row.attendance?.[player.id]);
                    const joinedRebuy = Boolean(row.rebuys?.[player.id]);
                    if (!joinedAttendance) {
                        return [player.id, ""];
                    }
                    const playerPoints = pointsByPlayer[player.id] ?? 0;
                    const winAmount = totalPoints > 0 ? (pool * playerPoints) / totalPoints : 0;
                    const totalCost = baseAmount + (joinedRebuy ? baseAmount : 0);
                    return [player.id, winAmount - totalCost];
                })
            );

            return [row.round, byPlayer];
        })
    );
}

export function computeJpbtSummary(workspace) {
    const players =
        Array.isArray(workspace?.players) && workspace.players.length > 0 ? workspace.players : [];
    const rows = Array.isArray(workspace?.rows) ? workspace.rows : [];
    const settings = workspace?.settings ?? {};
    const jackpotWins = Array.isArray(workspace?.jackpotWins) ? workspace.jackpotWins : [];
    if (players.length === 0) {
        return { players: [], check: 0 };
    }

    const baseAmount =
        Number(settings.buyIn || 0) - Number(settings.jackpot || 0) - Number(settings.bounty || 0);
    const profitByRound = computeProfitByRoundJpbt(players, rows, settings);
    const totalProfit = Object.fromEntries(players.map((player) => [player.id, 0]));
    const bountyTotal = Object.fromEntries(players.map((player) => [player.id, 0]));
    const jackpotTotal = Object.fromEntries(players.map((player) => [player.id, 0]));

    const koMoneyByRound = Object.fromEntries(
        rows.map((row) => {
            if (!row.date) {
                return [row.round, ""];
            }
            const attendanceCount = players.filter((player) => row.attendance?.[player.id]).length;
            const rebuyCount = players.filter((player) => row.rebuys?.[player.id]).length;
            const koMoney =
                attendanceCount > 1
                    ? ((attendanceCount + rebuyCount) / (attendanceCount - 1)) * Number(settings.bounty || 0)
                    : 0;
            return [row.round, koMoney];
        })
    );

    rows.forEach((row) => {
        players.forEach((player) => {
            const pid = player.id;
            const p = Number(profitByRound[row.round]?.[pid] ?? 0);
            if (!Number.isNaN(p)) totalProfit[pid] += p;
            const koCount = Number(row.bounty?.[pid] ?? 0);
            if (!Number.isNaN(koCount) && row.attendance?.[pid]) {
                bountyTotal[pid] += koCount * (koMoneyByRound[row.round] ?? 0);
            }
            const j = Number(row.jackpotContrib?.[pid] ?? 0);
            if (!Number.isNaN(j)) jackpotTotal[pid] += j;
        });
    });

    jackpotWins.forEach((item) => {
        const value = Number(item.amount ?? 0);
        if (!Number.isNaN(value) && item.winnerId) {
            jackpotTotal[item.winnerId] += value;
        }
    });

    const withNet = players.map((player) => {
        const pid = player.id;
        const sessions = rows.filter((row) => row.attendance?.[pid]).length;
        const rebuys = rows.filter((row) => row.rebuys?.[pid]).length;
        const entries = sessions + rebuys;
        const buyIn = entries * Number(settings.buyIn || 0);
        const prizePoolContribution = entries * baseAmount;
        const prize = prizePoolContribution;
        const net = totalProfit[pid] + bountyTotal[pid] + jackpotTotal[pid] + prize - buyIn;
        return {
            playerId: pid,
            playerName: player.name,
            net
        };
    });

    return {
        players: withNet,
        check: withNet.reduce((sum, row) => sum + row.net, 0)
    };
}

export function buildCombinedNetRows(masterPlayers, refreshKey = 0) {
    void refreshKey;
    const omahaSummary = computeOmahaSummary(loadWorkspace(OMAHA_STORAGE_KEY));
    const jpbtSummary = computeJpbtSummary(loadWorkspace(JPBT_STORAGE_KEY));

    const omahaNetById = Object.fromEntries(omahaSummary.players.map((row) => [row.playerId, row.net]));
    const jpbtNetById = Object.fromEntries(jpbtSummary.players.map((row) => [row.playerId, row.net]));

    const rows = masterPlayers.map((player) => {
        const omahaNet = Number(omahaNetById[player.id] ?? 0);
        const jpbtNet = Number(jpbtNetById[player.id] ?? 0);
        return {
            playerId: player.id,
            playerName: player.name,
            omahaNet,
            jpbtNet,
            totalNet: omahaNet + jpbtNet
        };
    });

    return { rows };
}
