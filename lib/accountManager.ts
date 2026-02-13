import { Storage } from "@plasmohq/storage"
import { supabase } from "./supabaseClient"

const storage = new Storage({
    area: "local"
})

export interface ManagedAccount {
    username: string
    avatarUrl?: string
    lastActive?: number
    isActiveOnInstagram?: boolean
}

/**
 * Gets the list of managed accounts from local storage.
 */
export async function getManagedAccounts(): Promise<ManagedAccount[]> {
    return await storage.get<ManagedAccount[]>("managedAccounts") || []
}

/**
 * Adds a new account to the managed list.
 */
export async function addManagedAccount(username: string): Promise<void> {
    const accounts = await getManagedAccounts()
    if (!accounts.find(a => a.username === username)) {
        accounts.push({
            username,
            lastActive: Date.now()
        })
        await storage.set("managedAccounts", accounts)
    }
}

/**
 * Removes an account from the managed list.
 */
export async function removeManagedAccount(username: string): Promise<void> {
    const accounts = await getManagedAccounts()
    const filtered = accounts.filter(a => a.username !== username)
    await storage.set("managedAccounts", filtered)
}

/**
 * Synchronizes the list of accounts with Supabase.
 */
export async function syncAccountsWithSupabase(): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const accounts = await getManagedAccounts()
    
    // 1. Fetch existing accounts from Supabase
    const { data: remoteAccounts } = await supabase
        .from('managed_accounts')
        .select('username')
        .eq('user_id', session.user.id)

    const remoteUsernames = new Set((remoteAccounts || []).map(a => a.username))
    
    // 2. Insert missing accounts to Supabase
    const toInsert = accounts
        .filter(a => !remoteUsernames.has(a.username))
        .map(a => ({
            user_id: session.user.id,
            username: a.username,
            last_active: new Date(a.lastActive || Date.now()).toISOString()
        }))

    if (toInsert.length > 0) {
        await supabase.from('managed_accounts').insert(toInsert)
    }
}
