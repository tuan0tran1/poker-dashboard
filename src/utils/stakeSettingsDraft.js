import { readNonNegativeStake, readPositiveBuyIn } from "./roundStakes";

export function createStakeSettingsDraft(settings) {
    return {
        buyIn: settings?.buyIn ?? "",
        jackpot: settings?.jackpot ?? "",
        bounty: settings?.bounty ?? ""
    };
}

export function hasPendingStakeSettingsDraft(settings, draft) {
    return (
        Number(settings?.buyIn ?? 0) !== Number(draft?.buyIn ?? 0) ||
        Number(settings?.jackpot ?? 0) !== Number(draft?.jackpot ?? 0) ||
        Number(settings?.bounty ?? 0) !== Number(draft?.bounty ?? 0)
    );
}

export function applyStakeSettingsDraft(settings, draft) {
    return {
        ...settings,
        buyIn: readPositiveBuyIn(draft?.buyIn, settings?.buyIn),
        jackpot: readNonNegativeStake(draft?.jackpot, settings?.jackpot),
        bounty: readNonNegativeStake(draft?.bounty, settings?.bounty)
    };
}

export function readStakeDraftNumber(value) {
    return Number(value || 0);
}
