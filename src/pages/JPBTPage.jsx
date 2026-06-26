import { useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency } from "../utils/finance";
import {
    applyRowStakesSnapshots,
    getRowKoMoney,
    getRowPrizeBaseAmount,
    sumJackpotContributions,
    sumPlayerBuyIn,
    sumPlayerPrizePoolContribution,
    withFrozenRowStakes
} from "../utils/roundStakes";
import { isSupabaseConfigured, loadCloudWorkspace, saveCloudWorkspace } from "../lib/cloudWorkspace";

const JPBT_STORAGE_KEY = "jpbt-workspace-v1";
const JPBT_SUBTAB_KEY = "jpbt-subtab-v1";
const SUB_TABS = ["Điểm danh", "Rebuys", "Rank", "Profit", "Tổng kết", "Bounty", "Jackpot", "Thống kê top", "Settings"];
const TAB_LABEL_MIGRATIONS = {
    "Diem danh": "Điểm danh",
    "Tong ket": "Tổng kết",
    "Thong ke top": "Thống kê top"
};
const DEFAULT_ROUNDS = 1;
const JACKPOT_TYPES = [
    { key: "Tu Quy", percent: 0.4 },
    { key: "TPS", percent: 0.7 },
    { key: "Bad Beat", percent: 1 },
    { key: "Royal Flush", percent: 1 }
];

function sortJackpotWinsNewestFirst(wins) {
    return [...wins].sort((a, b) => Number(b.id) - Number(a.id));
}

function jackpotRoundOptions(rows, currentRound) {
    const options = rows.length > 0 ? rows.map((row) => row.round) : [1];
    const numeric = Number(currentRound);
    if (Number.isFinite(numeric) && !options.includes(numeric)) {
        return [...options, numeric].sort((a, b) => a - b);
    }
    return options;
}

function getJackpotRoundValue(currentRound, rows) {
    const options = jackpotRoundOptions(rows, currentRound);
    const numeric = Number(currentRound);
    if (options.includes(numeric)) return numeric;
    return options[options.length - 1] ?? 1;
}

function getTodayDateInputValue() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function createRows(players, count = DEFAULT_ROUNDS) {
    return Array.from({ length: count }, (_, index) => ({
        round: index + 1,
        date: getTodayDateInputValue(),
        attendance: Object.fromEntries(players.map((player) => [player.id, false])),
        rebuys: Object.fromEntries(players.map((player) => [player.id, false])),
        rank: Object.fromEntries(players.map((player) => [player.id, "NA"])),
        profit: Object.fromEntries(players.map((player) => [player.id, ""])),
        bounty: Object.fromEntries(players.map((player) => [player.id, ""])),
        bountyPot: "",
        jackpotContrib: Object.fromEntries(players.map((player) => [player.id, ""])),
        jackpotInOut: ""
    }));
}

function createDefaultRankPoints(count) {
    return Object.fromEntries(
        Array.from({ length: count }, (_, idx) => {
            const rank = idx + 1;
            if (rank === 1) return [rank, 6];
            if (rank === 2) return [rank, 4];
            if (rank === 3) return [rank, 3];
            if (rank === 4) return [rank, 2];
            if (rank === 5) return [rank, 1];
            return [rank, 0];
        })
    );
}

function isLegacyLinearRankPoints(rankPoints, count) {
    if (!rankPoints) return false;
    return Array.from({ length: count }, (_, idx) => idx + 1).every(
        (rank) => Number(rankPoints[rank] ?? NaN) === Math.max(count - (rank - 1), 0)
    );
}

function isPreviousSampleRankPoints(rankPoints, count) {
    if (!rankPoints) return false;
    return Array.from({ length: count }, (_, idx) => idx + 1).every((rank) => {
        if (rank === 1) return Number(rankPoints[rank] ?? NaN) === 6;
        if (rank === 2) return Number(rankPoints[rank] ?? NaN) === 4;
        if (rank === 3) return Number(rankPoints[rank] ?? NaN) === 3;
        if (rank === 4) return Number(rankPoints[rank] ?? NaN) === 2;
        if (rank === 5) return Number(rankPoints[rank] ?? NaN) === 1;
        return Number(rankPoints[rank] ?? NaN) === 0;
    });
}

function createDefaultSettings(players) {
    return {
        buyIn: 200000,
        jackpot: 10000,
        bounty: 10000,
        rankPoints: createDefaultRankPoints(players.length),
        rankPointsCustomized: false,
        blindLevels: [
            { id: 1, level: 1, blind: "10/20", duration: "20'", note: "" },
            { id: 2, level: 2, blind: "20/40", duration: "20'", note: "" },
            { id: 3, level: 3, blind: "30/60", duration: "20'", note: "" },
            { id: 4, level: 4, blind: "40/80", duration: "20'", note: "" },
            { id: 5, level: 5, blind: "60/120", duration: "20'", note: "" },
            { id: 6, level: 6, blind: "100/200", duration: "10'", note: "" },
            { id: 7, level: 7, blind: "150/300", duration: "10'", note: "" },
            { id: 8, level: 8, blind: "200/400", duration: "10'", note: "Ko rebuy" }
        ]
    };
}

function defaultNotes() {
    return Object.fromEntries(SUB_TABS.map((tab) => [tab, ""]));
}

function normalizeNotes(notes) {
    const nextNotes = defaultNotes();
    Object.entries(notes ?? {}).forEach(([key, value]) => {
        const nextKey = TAB_LABEL_MIGRATIONS[key] ?? key;
        if (Object.hasOwn(nextNotes, nextKey)) {
            nextNotes[nextKey] = value;
        }
    });
    return nextNotes;
}

function rankOptions(count, row, playerId) {
    const currentRank = row.rank?.[playerId] ?? "NA";
    const selectedByOthers = new Set(
        Object.entries(row.rank ?? {})
            .filter(([id, rank]) => id !== playerId && rank !== "NA")
            .map(([, rank]) => rank)
    );

    return ["NA", ...Array.from({ length: count }, (_, i) => `Top ${i + 1}`)].filter(
        (option) => option === "NA" || option === currentRank || !selectedByOthers.has(option)
    );
}

function bountyKoOptions(row, players) {
    const attendanceCount = players.filter((player) => row.attendance?.[player.id]).length;
    return ["", ...Array.from({ length: attendanceCount }, (_, index) => String(index + 1))];
}

function formatBountyKoDisplay(value) {
    if (value === "" || value === null || value === undefined || value === "0" || value === 0) return "";
    return String(value);
}

function getBountyKoValue(row, playerId, players) {
    const raw = row.bounty?.[playerId];
    if (raw === "" || raw === null || raw === undefined || raw === "0") return "";
    const attendanceCount = players.filter((player) => row.attendance?.[player.id]).length;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) return "";
    if (attendanceCount === 0) return "";
    return String(Math.min(numeric, attendanceCount));
}

function formatOptionalNumberInput(value) {
    if (value === "" || value === null || value === undefined) return "";
    if (Number(value) === 0) return "";
    return value;
}

function parseOptionalNumberInput(value) {
    if (value === "" || value === null || value === undefined) return "";
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : "";
}

function rankColorClass(rank) {
    const rankNumber = Number(String(rank).replace("Top ", ""));
    if (!Number.isFinite(rankNumber)) return "";
    if (rankNumber <= 3) return `rank-top-${rankNumber}`;
    return "rank-top-other";
}

function normalizeBlindLevels(levels) {
    if (!Array.isArray(levels)) return [];
    return levels.map((item, index) => ({
        id: item.id ?? index + 1,
        level: Number(item.level ?? index + 1),
        blind: item.blind ?? "",
        duration: item.duration ?? "",
        note: item.note ?? ""
    }));
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
}

function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function isBlankRow(row, players) {
    return (
        players.every((player) => !row.attendance?.[player.id]) &&
        players.every((player) => !row.rebuys?.[player.id]) &&
        players.every((player) => (row.rank?.[player.id] ?? "NA") === "NA") &&
        players.every((player) => !row.bounty?.[player.id] || row.bounty[player.id] === "0") &&
        players.every((player) => !row.jackpotContrib?.[player.id])
    );
}

function normalizeRows(rows, players = []) {
    const nextRows = rows.map((row, index) => ({ ...row, round: index + 1 }));
    while (nextRows.length > 1 && isBlankRow(nextRows.at(-1), players) && isBlankRow(nextRows.at(-2), players)) {
        nextRows.pop();
    }
    return nextRows.map((row, index) => ({ ...row, round: index + 1 }));
}

function withPlayerKeys(rows, players) {
    return rows.map((row) => ({
        ...row,
        attendance: Object.fromEntries(players.map((p) => [p.id, Boolean(row.attendance?.[p.id])])),
        rebuys: Object.fromEntries(
            players.map((p) => [p.id, Boolean(row.attendance?.[p.id]) && Boolean(row.rebuys?.[p.id])])
        ),
        rank: Object.fromEntries(players.map((p) => [p.id, row.rank?.[p.id] ?? "NA"])),
        profit: Object.fromEntries(players.map((p) => [p.id, row.profit?.[p.id] ?? ""])),
        bounty: Object.fromEntries(players.map((p) => [p.id, row.bounty?.[p.id] ?? ""])),
        jackpotContrib: Object.fromEntries(players.map((p) => [p.id, row.jackpotContrib?.[p.id] ?? ""])),
        bountyPot: row.bountyPot ?? "",
        jackpotInOut: row.jackpotInOut ?? ""
    }));
}

export default function JPBTPage({ players: seedPlayers }) {
    const [initialData] = useState(() => {
        const defaultPlayers = seedPlayers.map((p) => ({ id: p.id, name: p.name }));
        const defaultRows = createRows(defaultPlayers);
        const defaultSettings = createDefaultSettings(defaultPlayers);
        const raw = localStorage.getItem(JPBT_STORAGE_KEY);
        if (!raw) return { players: defaultPlayers, rows: defaultRows, settings: defaultSettings, notes: defaultNotes(), jackpotWins: [] };
        try {
            const parsed = JSON.parse(raw);
            const players = Array.isArray(parsed.players) && parsed.players.length > 0 ? parsed.players : defaultPlayers;
            const parsedRankPoints = parsed.settings?.rankPoints;
            const rankPointsCustomized = Boolean(parsed.settings?.rankPointsCustomized);
            const defaultRankPoints = createDefaultRankPoints(players.length);
            const shouldMigrateRankPoints =
                !rankPointsCustomized &&
                (isLegacyLinearRankPoints(parsedRankPoints, players.length) ||
                    isPreviousSampleRankPoints(parsedRankPoints, players.length));
            const nextRankPoints = shouldMigrateRankPoints
                ? defaultRankPoints
                : Object.fromEntries(
                      players.map((_, idx) => [idx + 1, parsedRankPoints?.[idx + 1] ?? defaultRankPoints[idx + 1]])
                  );
            const settings = {
                ...defaultSettings,
                ...(parsed.settings ?? {}),
                rankPoints: nextRankPoints,
                rankPointsCustomized,
                blindLevels: normalizeBlindLevels(
                    parsed.settings?.blindLevels ?? defaultSettings.blindLevels
                )
            };
            const normalizedRows = Array.isArray(parsed.rows)
                ? normalizeRows(withPlayerKeys(parsed.rows, players), players)
                : defaultRows;
            return {
                players,
                rows: applyRowStakesSnapshots(normalizedRows, settings, players),
                settings,
                notes: normalizeNotes(parsed.notes),
                jackpotWins: sortJackpotWinsNewestFirst(
                    Array.isArray(parsed.jackpotWins) ? parsed.jackpotWins : []
                )
            };
        } catch {
            return { players: defaultPlayers, rows: defaultRows, settings: defaultSettings, notes: defaultNotes(), jackpotWins: [] };
        }
    });

    const [subTab, setSubTab] = useState(() => {
        const saved = localStorage.getItem(JPBT_SUBTAB_KEY);
        return SUB_TABS.includes(saved) ? saved : "Điểm danh";
    });
    const [players, setPlayers] = useState(initialData.players);
    const [rows, setRows] = useState(initialData.rows);
    const [settings, setSettings] = useState(initialData.settings);
    const [notes, setNotes] = useState(initialData.notes);
    const [jackpotWins, setJackpotWins] = useState(initialData.jackpotWins);
    const [newPlayerName, setNewPlayerName] = useState("");
    const [editingPlayerId, setEditingPlayerId] = useState(null);
    const [editingPlayerName, setEditingPlayerName] = useState("");
    const [blindLevelError, setBlindLevelError] = useState("");
    const [toast, setToast] = useState(null);
    const [selectedHistoryRound, setSelectedHistoryRound] = useState("");
    const [cloudReady, setCloudReady] = useState(!isSupabaseConfigured);
    const hasLoadedCloudRef = useRef(false);

    useEffect(() => {
        if (!toast) return undefined;
        const timeoutId = window.setTimeout(() => setToast(null), 4500);
        return () => window.clearTimeout(timeoutId);
    }, [toast]);

    useEffect(() => {
        localStorage.setItem(JPBT_SUBTAB_KEY, subTab);
    }, [subTab]);

    const showToast = (message, type = "info") => {
        setToast({ message, type });
    };

    const normalizeWorkspaceData = (workspaceData) => {
        const nextPlayers =
            Array.isArray(workspaceData.players) && workspaceData.players.length > 0
                ? workspaceData.players
                : players;
        const defaultSettings = createDefaultSettings(nextPlayers);
        const parsedRankPoints = workspaceData.settings?.rankPoints;
        const nextSettings = {
            ...defaultSettings,
            ...(workspaceData.settings ?? {}),
            rankPoints: Object.fromEntries(
                nextPlayers.map((_, idx) => [
                    idx + 1,
                    parsedRankPoints?.[idx + 1] ?? defaultSettings.rankPoints[idx + 1]
                ])
            ),
            rankPointsCustomized: Boolean(workspaceData.settings?.rankPointsCustomized),
            blindLevels: normalizeBlindLevels(workspaceData.settings?.blindLevels ?? defaultSettings.blindLevels)
        };

        return {
            players: nextPlayers,
            rows: Array.isArray(workspaceData.rows)
                ? applyRowStakesSnapshots(
                    normalizeRows(withPlayerKeys(workspaceData.rows, nextPlayers), nextPlayers),
                    nextSettings,
                    nextPlayers
                )
                : createRows(nextPlayers),
            settings: nextSettings,
            notes: normalizeNotes(workspaceData.notes),
            jackpotWins: sortJackpotWinsNewestFirst(
                Array.isArray(workspaceData.jackpotWins) ? workspaceData.jackpotWins : []
            )
        };
    };

    const applyWorkspaceData = (workspaceData) => {
        const nextWorkspace = normalizeWorkspaceData(workspaceData);
        setPlayers(nextWorkspace.players);
        setRows(nextWorkspace.rows);
        setSettings(nextWorkspace.settings);
        setNotes(nextWorkspace.notes);
        setJackpotWins(nextWorkspace.jackpotWins);
    };

    const getWorkspaceData = () => ({
        type: "jpbt",
        players,
        rows,
        settings,
        notes,
        jackpotWins: sortJackpotWinsNewestFirst(jackpotWins)
    });

    useEffect(() => {
        if (!isSupabaseConfigured) {
            hasLoadedCloudRef.current = true;
            return undefined;
        }

        let cancelled = false;

        async function loadWorkspace() {
            let canSaveToCloud = false;
            try {
                const cloudData = await loadCloudWorkspace(JPBT_STORAGE_KEY);
                if (cancelled) return;
                canSaveToCloud = true;
                if (cloudData) {
                    applyWorkspaceData(cloudData);
                    showToast("Đã tải dữ liệu JP+BT từ cloud.");
                } else {
                    showToast("Cloud JP+BT chưa có dữ liệu, sẽ tải dữ liệu hiện tại lên.");
                }
            } catch {
                if (!cancelled) {
                    showToast("Không thể tải dữ liệu JP+BT từ cloud, đang dùng dữ liệu trên máy.", "error");
                }
            } finally {
                if (!cancelled && canSaveToCloud) {
                    hasLoadedCloudRef.current = true;
                    setCloudReady(true);
                }
            }
        }

        loadWorkspace();

        return () => {
            cancelled = true;
        };
        // Cloud should load only once on mount; the helper intentionally uses initial local state as fallback.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const workspaceData = { type: "jpbt", players, rows, settings, notes, jackpotWins };
        localStorage.setItem(JPBT_STORAGE_KEY, JSON.stringify(workspaceData));

        if (!cloudReady || !isSupabaseConfigured || !hasLoadedCloudRef.current) {
            return undefined;
        }

        const timeoutId = window.setTimeout(async () => {
            try {
                await saveCloudWorkspace(JPBT_STORAGE_KEY, workspaceData);
            } catch {
                showToast("Không thể lưu JP+BT lên cloud, dữ liệu vẫn được lưu trên máy.", "error");
            }
        }, 900);

        return () => window.clearTimeout(timeoutId);
    }, [players, rows, settings, notes, jackpotWins, cloudReady]);

    const syncRowsWithPlayers = (nextPlayers) => {
        setRows((prev) => withPlayerKeys(prev, nextPlayers));
        setSettings((prev) => ({
            ...prev,
            rankPoints: Object.fromEntries(
                nextPlayers.map((_, idx) => [idx + 1, prev.rankPoints?.[idx + 1] ?? createDefaultRankPoints(nextPlayers.length)[idx + 1]])
            )
        }));
        setJackpotWins((prev) =>
            prev
                .map((row) => ({
                    ...row,
                    winnerId: nextPlayers.some((player) => player.id === row.winnerId) ? row.winnerId : ""
                }))
        );
    };

    const updateRow = (round, updater) => {
        setRows((prev) =>
            prev.map((row) => {
                if (row.round !== round) return row;
                const next = updater(row);
                return withFrozenRowStakes(next, settings, players);
            })
        );
    };

    const selectAllAttendance = (round) => {
        updateRow(round, (row) => ({
            ...row,
            attendance: Object.fromEntries(players.map((player) => [player.id, true])),
            rank: Object.fromEntries(players.map((player) => [player.id, row.rank?.[player.id] ?? "NA"]))
        }));
    };

    const clearAllAttendance = (round) => {
        updateRow(round, (row) => ({
            ...row,
            attendance: Object.fromEntries(players.map((player) => [player.id, false])),
            rebuys: Object.fromEntries(players.map((player) => [player.id, false])),
            rank: Object.fromEntries(players.map((player) => [player.id, "NA"])),
            bounty: Object.fromEntries(players.map((player) => [player.id, ""])),
            jackpotContrib: Object.fromEntries(players.map((player) => [player.id, ""]))
        }));
    };

    const addRound = () => {
        const currentRow = rows.at(-1);
        if (currentRow && isBlankRow(currentRow, players)) {
            showToast("Lần chơi hiện tại chưa có dữ liệu điểm danh.", "error");
            return;
        }
        setSelectedHistoryRound("");
        setRows((prev) => [
            ...prev.map((row, index) =>
                index === prev.length - 1
                    ? withFrozenRowStakes(
                        { ...row, date: row.date || getTodayDateInputValue() },
                        settings,
                        players
                    )
                    : row
            ),
            {
                round: prev.length + 1,
                date: getTodayDateInputValue(),
                buyIn: Number(settings.buyIn ?? createDefaultSettings(players).buyIn),
                jackpotFee: Number(settings.jackpot ?? createDefaultSettings(players).jackpot),
                bountyFee: Number(settings.bounty ?? createDefaultSettings(players).bounty),
                attendance: Object.fromEntries(players.map((player) => [player.id, false])),
                rebuys: Object.fromEntries(players.map((player) => [player.id, false])),
                rank: Object.fromEntries(players.map((player) => [player.id, "NA"])),
                profit: Object.fromEntries(players.map((player) => [player.id, ""])),
                bounty: Object.fromEntries(players.map((player) => [player.id, ""])),
                bountyPot: "",
                jackpotContrib: Object.fromEntries(players.map((player) => [player.id, ""])),
                jackpotInOut: ""
            }
        ]);
    };

    const deleteRound = (round) => {
        setRows((prev) => {
            if (prev.length <= 1) return prev;
            return normalizeRows(prev.filter((row) => row.round !== round), players);
        });
    };

    const getSummaryText = () =>
        [
            ["Người chơi", "Pts", "Ses", "Rb", "Buy-in", "Prize", "Jackpot", "Bounty", "Net"].join("\t"),
            ...summary.players.map((row) =>
                [
                    row.playerName,
                    row.points,
                    row.sessions,
                    row.rebuys,
                    Math.round(row.buyIn),
                    Math.round(row.prize),
                    Math.round(row.jackpot),
                    Math.round(row.bounty),
                    Math.round(row.net)
                ].join("\t")
            ),
            "",
            ["Check", Math.round(summary.check)].join("\t"),
            ["Tổng prize", Math.round(summary.totalPrize)].join("\t"),
            ["Tổng điểm", summary.totalPoints].join("\t")
        ].join("\n");

    const validateDataBeforeSummaryAction = () => {
        if (dataIssues.length === 0) return true;
        const preview = dataIssues.slice(0, 5).map((issue) => `- ${issue.message}`).join("\n");
        const more = dataIssues.length > 5 ? `\n...và ${dataIssues.length - 5} lỗi khác.` : "";
        showToast(`Còn ${dataIssues.length} lỗi dữ liệu. Vui lòng sửa trước khi copy/reset:\n\n${preview}${more}`, "error");
        return false;
    };

    const copySummary = async () => {
        if (!validateDataBeforeSummaryAction()) return;
        try {
            await copyTextToClipboard(getSummaryText());
            showToast("Đã copy bảng Tổng kết.");
        } catch {
            showToast("Không thể copy bảng Tổng kết.", "error");
        }
    };

    const resetWorkspace = () => {
        if (!validateDataBeforeSummaryAction()) return;
        const confirmed = window.confirm("Reset dữ liệu chơi? Phần Settings sẽ được giữ nguyên.");
        if (!confirmed) return;
        downloadJson(`jpbt-auto-backup-before-reset-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, getBackupData());
        setRows(createRows(players));
        setNotes((prev) => ({ ...defaultNotes(), Settings: prev.Settings ?? "" }));
        setJackpotWins([]);
        showToast("Đã auto-backup và reset dữ liệu chơi.");
    };

    const getBackupData = () => ({
        ...getWorkspaceData(),
        exportedAt: new Date().toISOString()
    });

    const exportBackup = () => {
        downloadJson(`jpbt-backup-${new Date().toISOString().slice(0, 10)}.json`, getBackupData());
        showToast("Đã export backup JSON.");
    };

    const importBackup = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        try {
            const imported = JSON.parse(await file.text());
            const nextPlayers = Array.isArray(imported.players) && imported.players.length > 0 ? imported.players : players;
            const defaultSettings = createDefaultSettings(nextPlayers);
            const parsedRankPoints = imported.settings?.rankPoints;
            const nextSettings = {
                ...defaultSettings,
                ...(imported.settings ?? {}),
                rankPoints: Object.fromEntries(
                    nextPlayers.map((_, idx) => [
                        idx + 1,
                        parsedRankPoints?.[idx + 1] ?? defaultSettings.rankPoints[idx + 1]
                    ])
                ),
                rankPointsCustomized: Boolean(imported.settings?.rankPointsCustomized),
                blindLevels: normalizeBlindLevels(imported.settings?.blindLevels ?? defaultSettings.blindLevels)
            };
            downloadJson(`jpbt-auto-backup-before-import-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, getBackupData());
            setPlayers(nextPlayers);
            setRows(
                Array.isArray(imported.rows)
                    ? applyRowStakesSnapshots(
                        normalizeRows(withPlayerKeys(imported.rows, nextPlayers), nextPlayers),
                        nextSettings,
                        nextPlayers
                    )
                    : createRows(nextPlayers)
            );
            setSettings(nextSettings);
            setNotes(normalizeNotes(imported.notes));
            setJackpotWins(
                sortJackpotWinsNewestFirst(Array.isArray(imported.jackpotWins) ? imported.jackpotWins : [])
            );
            showToast("Đã auto-backup và import JSON.");
        } catch {
            showToast("File backup JSON không hợp lệ.", "error");
        }
    };

    const addPlayer = () => {
        const name = newPlayerName.trim();
        if (!name) return;
        const next = [...players, { id: (players.at(-1)?.id ?? 0) + 1, name }];
        setPlayers(next);
        syncRowsWithPlayers(next);
        setNewPlayerName("");
    };

    const deletePlayer = (playerId) => {
        const next = players.filter((player) => player.id !== playerId);
        if (next.length === 0) return;
        setPlayers(next);
        syncRowsWithPlayers(next);
    };

    const savePlayerName = (playerId) => {
        const name = editingPlayerName.trim();
        if (!name) return;
        const next = players.map((player) => (player.id === playerId ? { ...player, name } : player));
        setPlayers(next);
        syncRowsWithPlayers(next);
        setEditingPlayerId(null);
    };

    const hasDuplicateLevel = (blindLevels, level, currentId) =>
        blindLevels.some((item) => item.id !== currentId && Number(item.level) === Number(level));

    const addBlindLevel = () => {
        setSettings((prev) => {
            const nextLevel = (prev.blindLevels.at(-1)?.level ?? 0) + 1;
            const nextId = (prev.blindLevels.at(-1)?.id ?? 0) + 1;
            return {
                ...prev,
                blindLevels: [...prev.blindLevels, { id: nextId, level: nextLevel, blind: "", duration: "10'", note: "" }]
            };
        });
    };

    const updateBlindLevel = (id, patch) => {
        setSettings((prev) => {
            if (Object.hasOwn(patch, "level")) {
                const nextLevel = Number(patch.level);
                if (hasDuplicateLevel(prev.blindLevels, nextLevel, id)) {
                    setBlindLevelError(`Level ${nextLevel} đã tồn tại. Vui lòng chọn level khác.`);
                    return prev;
                }
            }
            setBlindLevelError("");
            return {
                ...prev,
                blindLevels: prev.blindLevels.map((item) => (item.id === id ? { ...item, ...patch } : item))
            };
        });
    };

    const profitByRound = useMemo(() => {
        return Object.fromEntries(
            rows.map((row) => {
                const baseAmount = getRowPrizeBaseAmount(row, settings);
                const attendeeCount = players.filter((player) => row.attendance?.[player.id]).length;
                const rebuyCount = players.filter((player) => row.rebuys?.[player.id]).length;
                const participantPool = attendeeCount * baseAmount;
                const rebuyPool = rebuyCount * baseAmount;
                const pool = participantPool + rebuyPool;

                const pointsByPlayer = Object.fromEntries(
                    players.map((player) => {
                        const rank = row.rank?.[player.id] ?? "NA";
                        if (!row.attendance?.[player.id] || rank === "NA") {
                            return [player.id, 0];
                        }
                        const rankNumber = Number(rank.replace("Top ", ""));
                        return [player.id, Number(settings.rankPoints[rankNumber] ?? 0)];
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
    }, [players, rows, settings.buyIn, settings.jackpot, settings.bounty, settings.rankPoints]);

    const dataIssues = rows.flatMap((row) => {
        const attendees = players.filter((player) => row.attendance?.[player.id]);
        if (attendees.length === 0) return [];

        const issues = [];
        const missingRankPlayers = attendees.filter((player) => (row.rank?.[player.id] ?? "NA") === "NA");
        if (missingRankPlayers.length > 0) {
            issues.push({
                key: `${row.round}-missing-rank`,
                message: `Lần chơi ${row.round}: ${missingRankPlayers.map((player) => player.name).join(", ")} đã điểm danh nhưng chưa chọn rank.`
            });
        }

        const ranksByValue = new Map();
        attendees.forEach((player) => {
            const rank = row.rank?.[player.id] ?? "NA";
            if (rank === "NA") return;
            ranksByValue.set(rank, [...(ranksByValue.get(rank) ?? []), player.name]);
        });
        Array.from(ranksByValue.entries())
            .filter(([, names]) => names.length > 1)
            .forEach(([rank, names]) => {
                issues.push({
                    key: `${row.round}-duplicate-${rank}`,
                    message: `Lần chơi ${row.round}: ${rank} bị trùng cho ${names.join(", ")}.`
                });
            });

        const profitTotal = players.reduce((sum, player) => {
            const value = profitByRound[row.round]?.[player.id];
            const amount = Number(value);
            return Number.isFinite(amount) ? sum + amount : sum;
        }, 0);
        if (Math.abs(profitTotal) > 1) {
            issues.push({
                key: `${row.round}-profit-balance`,
                message: `Lần chơi ${row.round}: tổng profit đang lệch ${formatCurrency(profitTotal)}.`
            });
        }

        return issues;
    });

    const deleteBlindLevel = (id) => {
        setSettings((prev) => {
            if (prev.blindLevels.length <= 1) return prev;
            return { ...prev, blindLevels: prev.blindLevels.filter((item) => item.id !== id) };
        });
    };

    const addJackpotWin = () => {
        const defaultRound = rows.at(-1)?.round ?? 1;
        setJackpotWins((prev) => {
            const nextId = prev.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
            return sortJackpotWinsNewestFirst([
                { id: nextId, round: defaultRound, winnerId: "", type: "Tu Quy", amount: "" },
                ...prev
            ]);
        });
    };

    const updateJackpotWin = (id, patch) => {
        setJackpotWins((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    };

    const deleteJackpotWin = (id) => {
        setJackpotWins((prev) => prev.filter((item) => item.id !== id));
    };

    const summary = (() => {
        const rankCount = Object.fromEntries(players.map((player) => [player.id, Object.fromEntries(players.map((_, idx) => [idx + 1, 0]))]));
        const totalRank = Object.fromEntries(players.map((player) => [player.id, 0]));
        const totalRankRound = Object.fromEntries(players.map((player) => [player.id, 0]));
        const totalProfit = Object.fromEntries(players.map((player) => [player.id, 0]));
        const bountyTotal = Object.fromEntries(players.map((player) => [player.id, 0]));
        const jackpotTotal = Object.fromEntries(players.map((player) => [player.id, 0]));

        const koMoneyByRound = Object.fromEntries(
            rows.map((row) => [row.round, getRowKoMoney(row, settings, players)])
        );

        rows.forEach((row) => {
            players.forEach((player) => {
                const pid = player.id;
                const rank = row.rank?.[pid] ?? "NA";
                if (rank !== "NA") {
                    const rankNumber = Number(rank.replace("Top ", ""));
                    if (rankNumber >= 1) {
                        rankCount[pid][rankNumber] += 1;
                        totalRank[pid] += rankNumber;
                        totalRankRound[pid] += 1;
                    }
                }
                const p = Number(profitByRound[row.round]?.[pid] ?? 0);
                if (!Number.isNaN(p)) totalProfit[pid] += p;
                const koCount = Number(row.bounty?.[pid] ?? 0);
                if (!Number.isNaN(koCount) && row.attendance?.[pid]) {
                    bountyTotal[pid] += koCount * Number(koMoneyByRound[row.round] || 0);
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

        const playerRows = players.map((player) => {
            const pid = player.id;
            const sessions = rows.filter((row) => row.attendance?.[pid]).length;
            const rebuys = rows.filter((row) => row.rebuys?.[pid]).length;
            const points = rows.reduce((sum, row) => {
                const rank = row.rank?.[pid] ?? "NA";
                if (rank === "NA") return sum;
                const rankNumber = Number(rank.replace("Top ", ""));
                return sum + (settings.rankPoints[rankNumber] ?? 0);
            }, 0);
            const entries = sessions + rebuys;
            const buyIn = sumPlayerBuyIn(rows, pid, settings);
            const prizePoolContribution = sumPlayerPrizePoolContribution(rows, pid, settings);
            return {
                playerId: pid,
                playerName: player.name,
                points,
                sessions,
                rebuys,
                entries,
                buyIn,
                prizePoolContribution,
                prize: 0,
                jackpot: jackpotTotal[pid],
                bounty: bountyTotal[pid],
                rawProfit: totalProfit[pid],
                topStats: rankCount[pid],
                avgRank: totalRankRound[pid] > 0 ? totalRank[pid] / totalRankRound[pid] : 0
            };
        });

        const totalPrize = playerRows.reduce((sum, row) => sum + row.prizePoolContribution, 0);
        const totalPoints = playerRows.reduce((sum, row) => sum + row.points, 0);

        const withPrize = playerRows.map((row) => {
            const prize = row.prizePoolContribution;
            const net = row.rawProfit + row.bounty + row.jackpot + prize - row.buyIn;
            return {
                ...row,
                prize,
                net
            };
        });

        const check = withPrize.reduce((sum, row) => sum + row.net, 0);
        return { players: withPrize, totalPrize, totalPoints, check, koMoneyByRound };
    })();

    const jackpotTotalContribAuto = useMemo(
        () => sumJackpotContributions(rows, players, settings),
        [rows, players, settings]
    );
    const jackpotTotalContrib = jackpotTotalContribAuto;
    const jackpotPaid = useMemo(
        () => jackpotWins.reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
        [jackpotWins]
    );
    const jackpotWinsSorted = useMemo(() => sortJackpotWinsNewestFirst(jackpotWins), [jackpotWins]);
    const jackpotRemain = jackpotTotalContrib - jackpotPaid;
    const latestAttendanceRow = rows.at(-1);
    const selectedHistoryRow = rows.find((row) => String(row.round) === selectedHistoryRound);
    const selectedHistoryRoundValue = selectedHistoryRow ? selectedHistoryRound : "";
    const currentAttendanceRow = selectedHistoryRow ?? latestAttendanceRow;
    const attendanceHistoryRows = [...rows.slice(0, -1)].sort((a, b) => {
        const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
        return dateCompare || Number(b.round) - Number(a.round);
    });
    const historyEditSelect = (
        <div className="form-grid">
            <label>
                Chọn ngày/lần chơi để chỉnh sửa
                <select value={selectedHistoryRoundValue} onChange={(e) => setSelectedHistoryRound(e.target.value)}>
                    <option value="">
                        Lần hiện tại {latestAttendanceRow ? `${latestAttendanceRow.round} - ${latestAttendanceRow.date || "Chưa có ngày"}` : ""}
                    </option>
                    {attendanceHistoryRows.map((row) => (
                        <option key={row.round} value={row.round}>
                            Lần {row.round} - {row.date || "Chưa có ngày"}
                        </option>
                    ))}
                </select>
            </label>
        </div>
    );

    return (
        <div className="stack">
            {toast && (
                <div className={`toast toast-${toast.type}`}>
                    {toast.message}
                </div>
            )}

            <div className="tab-row page-tab-row">
                {SUB_TABS.map((name) => (
                    <button
                        key={name}
                        className={subTab === name ? "tab tab-active" : "tab"}
                        onClick={() => setSubTab(name)}
                    >
                        {name}
                    </button>
                ))}
            </div>

            {dataIssues.length > 0 && (
                <details className="card data-issues">
                    <summary>Có {dataIssues.length} lỗi dữ liệu</summary>
                    <ul>
                        {dataIssues.map((issue) => (
                            <li className="error-text" key={issue.key}>{issue.message}</li>
                        ))}
                    </ul>
                </details>
            )}

            {subTab === "Điểm danh" && (
                <div className="card">
                    <h2>Điểm danh</h2>
                    <div className="row-actions">
                        <button className="btn btn-primary" onClick={addRound}>Thêm lần chơi</button>
                    </div>
                    <table className="data-table desktop-view">
                        <thead>
                            <tr>
                                <th>Lần chơi</th>
                                <th>Chọn nhanh</th>
                                {players.map((p) => <th key={p.id}>{p.name}</th>)}
                                <th>Date</th>
                                <th>Xóa</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentAttendanceRow && (
                                <tr key={currentAttendanceRow.round}>
                                    <td>{currentAttendanceRow.round}</td>
                                    <td>
                                        <div className="row-actions">
                                            <button className="btn" onClick={() => selectAllAttendance(currentAttendanceRow.round)}>
                                                Chọn tất cả
                                            </button>
                                            <button className="btn" onClick={() => clearAllAttendance(currentAttendanceRow.round)}>
                                                Bỏ tất cả
                                            </button>
                                        </div>
                                    </td>
                                    {players.map((p) => (
                                        <td key={p.id}>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(currentAttendanceRow.attendance[p.id])}
                                                onChange={(e) =>
                                                    updateRow(currentAttendanceRow.round, (r) => ({
                                                        ...r,
                                                        attendance: { ...r.attendance, [p.id]: e.target.checked },
                                                        rebuys: {
                                                            ...r.rebuys,
                                                            [p.id]: e.target.checked ? Boolean(r.rebuys?.[p.id]) : false
                                                        },
                                                        rank: {
                                                            ...r.rank,
                                                            [p.id]: e.target.checked ? (r.rank?.[p.id] ?? "NA") : "NA"
                                                        }
                                                    }))
                                                }
                                            />
                                        </td>
                                    ))}
                                    <td>
                                        <input
                                            type="date"
                                            value={currentAttendanceRow.date}
                                            onChange={(e) => updateRow(currentAttendanceRow.round, (r) => ({ ...r, date: e.target.value }))}
                                        />
                                    </td>
                                    <td>
                                        <button className="btn btn-danger" onClick={() => deleteRound(currentAttendanceRow.round)}>Xóa</button>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    <div className="mobile-round-list">
                        {currentAttendanceRow && (
                            <div className="mobile-round-card" key={currentAttendanceRow.round}>
                                <div className="mobile-round-header">
                                    <strong>Lần chơi {currentAttendanceRow.round}</strong>
                                    <div className="row-actions">
                                        <button className="btn" onClick={() => selectAllAttendance(currentAttendanceRow.round)}>
                                            Chọn tất cả
                                        </button>
                                        <button className="btn" onClick={() => clearAllAttendance(currentAttendanceRow.round)}>
                                            Bỏ tất cả
                                        </button>
                                    </div>
                                </div>
                                <input
                                    type="date"
                                    value={currentAttendanceRow.date}
                                    onChange={(e) => updateRow(currentAttendanceRow.round, (r) => ({ ...r, date: e.target.value }))}
                                />
                                <div className="mobile-player-list">
                                    {players.map((p) => (
                                        <label className="mobile-player-row" key={p.id}>
                                            <span>{p.name}</span>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(currentAttendanceRow.attendance[p.id])}
                                                onChange={(e) =>
                                                    updateRow(currentAttendanceRow.round, (r) => ({
                                                        ...r,
                                                        attendance: { ...r.attendance, [p.id]: e.target.checked },
                                                        rebuys: {
                                                            ...r.rebuys,
                                                            [p.id]: e.target.checked ? Boolean(r.rebuys?.[p.id]) : false
                                                        },
                                                        rank: {
                                                            ...r.rank,
                                                            [p.id]: e.target.checked ? (r.rank?.[p.id] ?? "NA") : "NA"
                                                        }
                                                    }))
                                                }
                                            />
                                        </label>
                                    ))}
                                </div>
                                <button className="btn btn-danger" onClick={() => deleteRound(currentAttendanceRow.round)}>
                                    Xóa lần chơi
                                </button>
                            </div>
                        )}
                    </div>
                    <h3>Lịch sử người tham gia</h3>
                    {historyEditSelect}
                    <table className="data-table summary-table">
                        <thead>
                            <tr>
                                <th>Lần chơi</th>
                                {players.map((p) => <th key={p.id}>{p.name}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {attendanceHistoryRows.length > 0 ? (
                                attendanceHistoryRows.map((row) => (
                                    <tr key={row.round}>
                                        <td>{row.round}</td>
                                        {players.map((p) => (
                                            <td key={p.id}>{row.attendance[p.id] ? "✓" : ""}</td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={players.length + 1}>Chưa có lịch sử.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {subTab === "Rebuys" && (
                <div className="card">
                    <h2>Rebuys</h2>
                    <table className="data-table desktop-view">
                        <thead>
                            <tr>
                                <th>Lần chơi</th>
                                {players.map((p) => <th key={p.id}>{p.name}</th>)}
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentAttendanceRow && (
                                <tr key={currentAttendanceRow.round}>
                                    <td>{currentAttendanceRow.round}</td>
                                    {players.map((p) => (
                                        <td key={p.id}>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(currentAttendanceRow.attendance[p.id]) && Boolean(currentAttendanceRow.rebuys[p.id])}
                                                disabled={!currentAttendanceRow.attendance[p.id]}
                                                onChange={(e) =>
                                                    updateRow(currentAttendanceRow.round, (r) => ({
                                                        ...r,
                                                        rebuys: {
                                                            ...r.rebuys,
                                                            [p.id]: Boolean(r.attendance?.[p.id]) && e.target.checked
                                                        }
                                                    }))
                                                }
                                            />
                                        </td>
                                    ))}
                                    <td>{currentAttendanceRow.date}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    <div className="mobile-round-list">
                        {currentAttendanceRow && (
                            <div className="mobile-round-card" key={currentAttendanceRow.round}>
                                <div className="mobile-round-header">
                                    <strong>Lần chơi {currentAttendanceRow.round}</strong>
                                    <span>{currentAttendanceRow.date || "Chưa có ngày"}</span>
                                </div>
                                <div className="mobile-player-list">
                                    {players.map((p) => (
                                        <label className="mobile-player-row" key={p.id}>
                                            <span>{p.name}</span>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(currentAttendanceRow.attendance[p.id]) && Boolean(currentAttendanceRow.rebuys[p.id])}
                                                disabled={!currentAttendanceRow.attendance[p.id]}
                                                onChange={(e) =>
                                                    updateRow(currentAttendanceRow.round, (r) => ({
                                                        ...r,
                                                        rebuys: {
                                                            ...r.rebuys,
                                                            [p.id]: Boolean(r.attendance?.[p.id]) && e.target.checked
                                                        }
                                                    }))
                                                }
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <h3>Lịch sử rebuys</h3>
                    {historyEditSelect}
                    <table className="data-table summary-table">
                        <thead>
                            <tr>
                                <th>Lần chơi</th>
                                {players.map((p) => <th key={p.id}>{p.name}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {attendanceHistoryRows.length > 0 ? (
                                attendanceHistoryRows.map((row) => (
                                    <tr key={row.round}>
                                        <td>{row.round}</td>
                                        {players.map((p) => (
                                            <td key={p.id}>
                                                {row.attendance[p.id] && row.rebuys[p.id] ? "✓" : ""}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={players.length + 1}>Chưa có lịch sử.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {subTab === "Rank" && (
                <div className="card">
                    <h2>Rank</h2>
                    <table className="data-table desktop-view">
                        <thead>
                            <tr>
                                <th>Lần chơi</th>
                                {players.map((p) => <th key={p.id}>{p.name}</th>)}
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentAttendanceRow && (
                                <tr key={currentAttendanceRow.round}>
                                    <td>{currentAttendanceRow.round}</td>
                                    {players.map((p) => (
                                        <td key={p.id}>
                                            <select
                                                className={`rank-select ${rankColorClass(currentAttendanceRow.rank[p.id])}`}
                                                value={currentAttendanceRow.rank[p.id] ?? "NA"}
                                                disabled={!currentAttendanceRow.attendance[p.id]}
                                                onChange={(e) =>
                                                    updateRow(currentAttendanceRow.round, (r) => ({
                                                        ...r,
                                                        rank: { ...r.rank, [p.id]: e.target.value }
                                                    }))
                                                }
                                            >
                                                {rankOptions(players.length, currentAttendanceRow, p.id).map((option) => (
                                                    <option key={option} value={option}>
                                                        {option === "NA" ? "N/A" : option}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                    ))}
                                    <td>{currentAttendanceRow.date}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    <div className="mobile-round-list">
                        {currentAttendanceRow && (
                            <div className="mobile-round-card" key={currentAttendanceRow.round}>
                                <div className="mobile-round-header">
                                    <strong>Lần chơi {currentAttendanceRow.round}</strong>
                                    <span>{currentAttendanceRow.date || "Chưa có ngày"}</span>
                                </div>
                                <div className="mobile-player-list">
                                    {players.map((p) => (
                                        <label className="mobile-player-row" key={p.id}>
                                            <span>{p.name}</span>
                                            <select
                                                className={`rank-select ${rankColorClass(currentAttendanceRow.rank[p.id])}`}
                                                value={currentAttendanceRow.rank[p.id] ?? "NA"}
                                                disabled={!currentAttendanceRow.attendance[p.id]}
                                                onChange={(e) =>
                                                    updateRow(currentAttendanceRow.round, (r) => ({
                                                        ...r,
                                                        rank: { ...r.rank, [p.id]: e.target.value }
                                                    }))
                                                }
                                            >
                                                {rankOptions(players.length, currentAttendanceRow, p.id).map((option) => (
                                                    <option key={option} value={option}>
                                                        {option === "NA" ? "N/A" : option}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <h3>Lịch sử rank</h3>
                    {historyEditSelect}
                    <table className="data-table summary-table">
                        <thead>
                            <tr>
                                <th>Lần chơi</th>
                                {players.map((p) => <th key={p.id}>{p.name}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {attendanceHistoryRows.length > 0 ? (
                                attendanceHistoryRows.map((row) => (
                                    <tr key={row.round}>
                                        <td>{row.round}</td>
                                        {players.map((p) => (
                                            <td key={p.id}>
                                                {row.attendance[p.id]
                                                    ? row.rank[p.id] === "NA"
                                                        ? "N/A"
                                                        : row.rank[p.id] ?? "N/A"
                                                    : ""}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={players.length + 1}>Chưa có lịch sử.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {subTab === "Profit" && (
                <div className="card">
                    <h2>Profit</h2>
                    <table className="data-table summary-table">
                        <thead>
                            <tr>
                                <th>Lần chơi</th>
                                {players.map((p) => <th key={p.id}>{p.name}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {currentAttendanceRow && (
                                <tr key={currentAttendanceRow.round}>
                                    <td>{currentAttendanceRow.round}</td>
                                    {players.map((p) => (
                                        <td key={p.id}>
                                            {currentAttendanceRow.attendance[p.id]
                                                ? formatCurrency(Number(profitByRound[currentAttendanceRow.round]?.[p.id] ?? 0))
                                                : ""}
                                        </td>
                                    ))}
                                </tr>
                            )}
                        </tbody>
                    </table>
                    <h3>Lịch sử profit</h3>
                    {historyEditSelect}
                    <table className="data-table summary-table">
                        <thead>
                            <tr>
                                <th>Lần chơi</th>
                                {players.map((p) => <th key={p.id}>{p.name}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {attendanceHistoryRows.length > 0 ? (
                                attendanceHistoryRows.map((row) => (
                                    <tr key={row.round}>
                                        <td>{row.round}</td>
                                        {players.map((p) => (
                                            <td key={p.id}>
                                                {row.attendance[p.id]
                                                    ? formatCurrency(Number(profitByRound[row.round]?.[p.id] ?? 0))
                                                    : ""}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={players.length + 1}>Chưa có lịch sử.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {subTab === "Tổng kết" && (
                <div className="card">
                    <h2>Tổng kết</h2>
                    <div className="row-actions">
                        <button className="btn btn-primary" onClick={copySummary}>
                            Copy Tổng kết
                        </button>
                        <button className="btn btn-danger" onClick={resetWorkspace}>
                            Reset
                        </button>
                    </div>
                    <table className="data-table summary-table">
                        <thead>
                            <tr>
                                <th>Người chơi</th>
                                <th>Pts</th>
                                <th>Ses</th>
                                <th>Rb</th>
                                <th>Buy-in</th>
                                <th>Prize</th>
                                <th>Jackpot</th>
                                <th>Bounty</th>
                                <th>Net</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summary.players.map((row) => (
                                <tr key={row.playerId}>
                                    <td>{row.playerName}</td>
                                    <td>{row.points}</td>
                                    <td>{row.sessions}</td>
                                    <td>{row.rebuys}</td>
                                    <td>{formatCurrency(row.buyIn)}</td>
                                    <td>{formatCurrency(row.prize)}</td>
                                    <td>{formatCurrency(row.jackpot)}</td>
                                    <td>{formatCurrency(row.bounty)}</td>
                                    <td className={row.net >= 0 ? "text-positive" : "text-negative"}>
                                        {formatCurrency(row.net)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="summary-grid">
                        <div>Check: {formatCurrency(summary.check)}</div>
                        <div>Tổng prize: {formatCurrency(summary.totalPrize)}</div>
                        <div>Tổng điểm: {summary.totalPoints}</div>
                    </div>
                </div>
            )}

            {subTab === "Bounty" && (
                <div className="card">
                    <h2>Bounty</h2>
                    <table className="data-table desktop-view bounty-table">
                        <thead>
                            <tr>
                                <th>Lần chơi</th>
                                {players.map((p) => <th key={p.id}>{p.name}</th>)}
                                <th>Tiền K/O</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentAttendanceRow && (
                                <tr key={currentAttendanceRow.round}>
                                    <td>{currentAttendanceRow.round}</td>
                                    {players.map((p) => (
                                        <td key={p.id}>
                                            <select
                                                className="bounty-ko-select"
                                                value={getBountyKoValue(currentAttendanceRow, p.id, players)}
                                                disabled={!currentAttendanceRow.attendance[p.id]}
                                                onChange={(e) =>
                                                    updateRow(currentAttendanceRow.round, (r) => ({
                                                        ...r,
                                                        bounty: { ...r.bounty, [p.id]: e.target.value }
                                                    }))
                                                }
                                            >
                                                {bountyKoOptions(currentAttendanceRow, players).map((option) => (
                                                    <option key={option || "empty"} value={option}>
                                                        {option === "" ? "—" : option}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                    ))}
                                    <td>
                                        {summary.koMoneyByRound[currentAttendanceRow.round] === ""
                                            ? ""
                                            : formatCurrency(summary.koMoneyByRound[currentAttendanceRow.round] ?? 0)}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    <div className="mobile-round-list">
                        {currentAttendanceRow && (
                            <div className="mobile-round-card" key={currentAttendanceRow.round}>
                                <div className="mobile-round-header">
                                    <strong>Lần chơi {currentAttendanceRow.round}</strong>
                                    <span>
                                        Tiền K/O:{" "}
                                        {summary.koMoneyByRound[currentAttendanceRow.round] === ""
                                            ? "-"
                                            : formatCurrency(summary.koMoneyByRound[currentAttendanceRow.round] ?? 0)}
                                    </span>
                                </div>
                                <div className="mobile-player-list">
                                    {players.map((p) => (
                                        <label className="mobile-player-row" key={p.id}>
                                            <span>{p.name}</span>
                                            <select
                                                value={getBountyKoValue(currentAttendanceRow, p.id, players)}
                                                disabled={!currentAttendanceRow.attendance[p.id]}
                                                onChange={(e) =>
                                                    updateRow(currentAttendanceRow.round, (r) => ({
                                                        ...r,
                                                        bounty: { ...r.bounty, [p.id]: e.target.value }
                                                    }))
                                                }
                                            >
                                                {bountyKoOptions(currentAttendanceRow, players).map((option) => (
                                                    <option key={option || "empty"} value={option}>
                                                        {option === "" ? "—" : option}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <h3>Lịch sử bounty</h3>
                    {historyEditSelect}
                    <table className="data-table summary-table">
                        <thead>
                            <tr>
                                <th>Lần chơi</th>
                                {players.map((p) => <th key={p.id}>{p.name}</th>)}
                                <th>Tiền K/O</th>
                            </tr>
                        </thead>
                        <tbody>
                            {attendanceHistoryRows.length > 0 ? (
                                attendanceHistoryRows.map((row) => (
                                    <tr key={row.round}>
                                        <td>{row.round}</td>
                                        {players.map((p) => (
                                            <td key={p.id}>
                                                {row.attendance[p.id]
                                                    ? formatBountyKoDisplay(row.bounty[p.id])
                                                    : ""}
                                            </td>
                                        ))}
                                        <td>
                                            {summary.koMoneyByRound[row.round] === ""
                                                ? ""
                                                : formatCurrency(summary.koMoneyByRound[row.round] ?? 0)}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={players.length + 2}>Chưa có lịch sử.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {subTab === "Jackpot" && (
                <div className="card">
                    <h2>Jackpot</h2>
                    <div className="summary-grid jackpot-summary">
                        <div>Jackpot tổng đã góp: {formatCurrency(jackpotTotalContrib)}</div>
                        <div>Jackpot đã trả: {formatCurrency(jackpotPaid)}</div>
                        <div className="jackpot-remain-stat">
                            <span className="jackpot-remain-label">Jackpot còn lại</span>
                            <span
                                className={`jackpot-remain-value ${jackpotRemain < 0 ? "text-negative" : ""}`}
                            >
                                {formatCurrency(jackpotRemain)}
                            </span>
                        </div>
                    </div>
                    <h3>Danh sách ăn Jackpot</h3>
                    <div className="row-actions">
                        <button className="btn btn-primary" onClick={addJackpotWin}>Thêm dòng ăn jackpot</button>
                    </div>
                    <table className="data-table jackpot-wins-table">
                        <thead>
                            <tr>
                                <th>Lần chơi</th>
                                <th>Người ăn</th>
                                <th>Loại</th>
                                <th>Tiền ăn</th>
                                <th>Xóa</th>
                            </tr>
                        </thead>
                        <tbody>
                            {jackpotWinsSorted.map((item) => (
                                <tr key={item.id}>
                                    <td>
                                        <select
                                            value={getJackpotRoundValue(item.round, rows)}
                                            onChange={(e) =>
                                                updateJackpotWin(item.id, { round: Number(e.target.value) })
                                            }
                                        >
                                            {jackpotRoundOptions(rows, item.round).map((round) => (
                                                <option key={round} value={round}>
                                                    {round}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        <select
                                            value={item.winnerId}
                                            onChange={(e) => updateJackpotWin(item.id, { winnerId: Number(e.target.value) })}
                                        >
                                            <option value="">Chọn người</option>
                                            {players.map((player) => (
                                                <option key={player.id} value={player.id}>
                                                    {player.name}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        <select
                                            value={item.type}
                                            onChange={(e) => updateJackpotWin(item.id, { type: e.target.value })}
                                        >
                                            {JACKPOT_TYPES.map((jt) => (
                                                <option key={jt.key} value={jt.key}>
                                                    {jt.key}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            value={formatOptionalNumberInput(item.amount)}
                                            placeholder="Tiền ăn"
                                            onChange={(e) =>
                                                updateJackpotWin(item.id, {
                                                    amount: parseOptionalNumberInput(e.target.value)
                                                })
                                            }
                                        />
                                    </td>
                                    <td>
                                        <button className="btn btn-danger" onClick={() => deleteJackpotWin(item.id)}>
                                            Xóa
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <h3>Tính Jackpot theo %</h3>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Loại</th>
                                <th>%</th>
                                <th>Tiền</th>
                            </tr>
                        </thead>
                        <tbody>
                            {JACKPOT_TYPES.map((type) => (
                                <tr key={type.key}>
                                    <td>{type.key}</td>
                                    <td>{(type.percent * 100).toFixed(0)}%</td>
                                    <td>{formatCurrency(Math.round(jackpotRemain * type.percent))}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {subTab === "Thống kê top" && (
                <div className="card">
                    <h2>Thống kê top</h2>
                    <h3>Số lần Top 1</h3>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Người chơi</th>
                                <th>Số lần Top 1</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summary.players.map((row) => (
                                <tr key={row.playerId}>
                                    <td>{row.playerName}</td>
                                    <td>{row.topStats[1]}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <h3>Thống kê số lượng top</h3>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Người chơi</th>
                                {players.map((_, idx) => (
                                    <th key={idx}>Top {idx + 1}</th>
                                ))}
                                <th>Avg</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summary.players.map((row) => (
                                <tr key={row.playerId}>
                                    <td>{row.playerName}</td>
                                    {players.map((_, idx) => (
                                        <td key={idx}>{row.topStats[idx + 1]}</td>
                                    ))}
                                    <td>{row.avgRank > 0 ? row.avgRank.toFixed(2) : "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {subTab === "Settings" && (
                <div className="card">
                    <h2>Settings</h2>
                    <div className="editor-block">
                        <h3>Backup JSON</h3>
                        <div className="row-actions">
                            <button className="btn btn-primary" onClick={exportBackup}>
                                Export JSON
                            </button>
                            <label className="btn">
                                Import JSON
                                <input
                                    type="file"
                                    accept="application/json,.json"
                                    className="visually-hidden"
                                    onChange={importBackup}
                                />
                            </label>
                        </div>
                    </div>
                    <div className="editor-block">
                        <h3>Người tham gia (CRUD)</h3>
                        <div className="form-grid form-grid-4">
                            <input
                                type="text"
                                placeholder="Tên người chơi mới"
                                value={newPlayerName}
                                onChange={(e) => setNewPlayerName(e.target.value)}
                            />
                            <button className="btn btn-primary" onClick={addPlayer}>Thêm người chơi</button>
                        </div>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Tên</th>
                                    <th>Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {players.map((player) => (
                                    <tr key={player.id}>
                                        <td>
                                            {editingPlayerId === player.id ? (
                                                <input
                                                    type="text"
                                                    value={editingPlayerName}
                                                    onChange={(e) => setEditingPlayerName(e.target.value)}
                                                />
                                            ) : (
                                                player.name
                                            )}
                                        </td>
                                        <td>
                                            {editingPlayerId === player.id ? (
                                                <div className="row-actions">
                                                    <button className="btn btn-primary" onClick={() => savePlayerName(player.id)}>Lưu</button>
                                                    <button className="btn" onClick={() => setEditingPlayerId(null)}>Hủy</button>
                                                </div>
                                            ) : (
                                                <div className="row-actions">
                                                    <button
                                                        className="btn"
                                                        onClick={() => {
                                                            setEditingPlayerId(player.id);
                                                            setEditingPlayerName(player.name);
                                                        }}
                                                    >
                                                        Sửa
                                                    </button>
                                                    <button className="btn btn-danger" onClick={() => deletePlayer(player.id)}>
                                                        Xóa
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="form-grid form-grid-4">
                        <label>
                            Buy-in
                            <input
                                type="number"
                                value={settings.buyIn}
                                onChange={(e) => setSettings((prev) => ({ ...prev, buyIn: Number(e.target.value || 0) }))}
                            />
                        </label>
                        <label>
                            Jackpot mặc định
                            <input
                                type="number"
                                value={settings.jackpot}
                                onChange={(e) => setSettings((prev) => ({ ...prev, jackpot: Number(e.target.value || 0) }))}
                            />
                        </label>
                        <label>
                            Bounty mặc định
                            <input
                                type="number"
                                value={settings.bounty}
                                onChange={(e) => setSettings((prev) => ({ ...prev, bounty: Number(e.target.value || 0) }))}
                            />
                        </label>
                    </div>
                    <h3>Scoring Guide</h3>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Điểm</th>
                            </tr>
                        </thead>
                        <tbody>
                            {players.map((_, idx) => (
                                <tr key={idx}>
                                    <td>Top {idx + 1}</td>
                                    <td>
                                        <input
                                            type="number"
                                            value={settings.rankPoints[idx + 1] ?? 0}
                                            onChange={(e) =>
                                                setSettings((prev) => ({
                                                    ...prev,
                                                    rankPointsCustomized: true,
                                                    rankPoints: {
                                                        ...prev.rankPoints,
                                                        [idx + 1]: Number(e.target.value || 0)
                                                    }
                                                }))
                                            }
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <h3>Blind structure</h3>
                    <div className="row-actions">
                        <button className="btn btn-primary" onClick={addBlindLevel}>Thêm level</button>
                    </div>
                    {blindLevelError && <p className="error-text">{blindLevelError}</p>}
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Level</th>
                                <th>Blind</th>
                                <th>Duration</th>
                                <th>Note</th>
                                <th>Hành động</th>
                            </tr>
                        </thead>
                        <tbody>
                            {settings.blindLevels.map((item) => (
                                <tr key={item.id}>
                                    <td>
                                        <input
                                            type="number"
                                            value={item.level}
                                            onChange={(e) => updateBlindLevel(item.id, { level: Number(e.target.value || 0) })}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={item.blind}
                                            placeholder="VD: 300/600"
                                            onChange={(e) => updateBlindLevel(item.id, { blind: e.target.value })}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={item.duration}
                                            placeholder="VD: 10'"
                                            onChange={(e) => updateBlindLevel(item.id, { duration: e.target.value })}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={item.note}
                                            placeholder="Ghi chú..."
                                            onChange={(e) => updateBlindLevel(item.id, { note: e.target.value })}
                                        />
                                    </td>
                                    <td>
                                        <button className="btn btn-danger" onClick={() => deleteBlindLevel(item.id)}>Xóa</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
