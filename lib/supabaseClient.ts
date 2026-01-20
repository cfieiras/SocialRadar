import { createClient } from "@supabase/supabase-js"

const supabaseUrl = "https://trvlmnebdwafftargsbr.supabase.co"
const supabaseKey = "sb_publishable_iCtTB5RChN4P75fjlLTS8Q_RIOFrVtP"

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        storage: localStorage, // Persist session in local storage for the popup
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false // No needed for extension popup
    }
})
