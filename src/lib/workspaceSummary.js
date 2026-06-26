import {
    computeProfitByRound,
    getRowKoMoney,
    sumPlayerBuyIn,
    sumPlayerPrizePoolContribution
} from "../utils/roundStakes";

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
    return computeProfitByRound(rows, players, settings, "omaha");
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
    return computeProfitByRound(rows, players, settings, "jpbt");
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

    const profitByRound = computeProfitByRoundJpbt(players, rows, settings);
    const totalProfit = Object.fromEntries(players.map((player) => [player.id, 0]));
    const bountyTotal = Object.fromEntries(players.map((player) => [player.id, 0]));
    const jackpotTotal = Object.fromEntries(players.map((player) => [player.id, 0]));

    const koMoneyByRound = Object.fromEntries(
        rows.map((row) => [row.round, getRowKoMoney(row, settings, players)])
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
        const buyIn = sumPlayerBuyIn(rows, pid, settings);
        const prize = sumPlayerPrizePoolContribution(rows, pid, settings);
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
