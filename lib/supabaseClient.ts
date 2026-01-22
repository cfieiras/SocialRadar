import { createClient } from "@supabase/supabase-js"
import { Storage } from "@plasmohq/storage"

const storage = new Storage({
    area: "local"
})

// Custom storage adapter for Supabase to work in Service Workers and Tabs
const supabaseStorageAdapter = {
    getItem: (key: string) => storage.get(key),
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.remove(key),
}

const supabaseUrl = "https://trvlmnebdwafftargsbr.supabase.co"
const supabaseKey = "sb_publishable_iCtTB5RChN4P75fjlLTS8Q_RIOFrVtP"

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        storage: supabaseStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
    }
})
