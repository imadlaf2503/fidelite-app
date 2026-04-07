const { createClient } = require('@supabase/supabase-js');

// On centralise la connexion ici
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE
);

module.exports = supabase;