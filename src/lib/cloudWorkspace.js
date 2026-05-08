import { isSupabaseConfigured, supabase } from "./supabaseClient";

const WORKSPACES_TABLE = "workspaces";

export { isSupabaseConfigured };

export async function loadCloudWorkspace(workspaceId) {
    if (!isSupabaseConfigured) {
        return null;
    }

    const { data, error } = await supabase
        .from(WORKSPACES_TABLE)
        .select("data")
        .eq("id", workspaceId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data?.data ?? null;
}

export async function saveCloudWorkspace(workspaceId, workspaceData) {
    if (!isSupabaseConfigured) {
        return;
    }

    const { error } = await supabase
        .from(WORKSPACES_TABLE)
        .upsert({
            id: workspaceId,
            data: workspaceData,
            updated_at: new Date().toISOString()
        });

    if (error) {
        throw error;
    }
}
