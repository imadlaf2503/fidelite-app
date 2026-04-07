const supabase = require('../config/supabase');
const render = require('../utils/renderer');

// --- 1. DASHBOARD PRINCIPAL ---
exports.getDashboard = async (req, res) => {
    try {
        const { slug } = req.params;
        const authToken = req.query.auth;

        const { data: b, error: bError } = await supabase.from('business').select('*').eq('slug', slug).single();
        if (bError || !b) return res.status(404).send("Commerce inconnu");

        const { data: customers } = await supabase
            .from('customers')
            .select('*')
            .eq('business_id', b.id)
            .order('created_at', { ascending: false });
        
        const REWARD_THRESHOLD = parseInt(b.points_thresholds) || 10; 
        const totalClients = customers ? customers.length : 0;
        const pointsTotal = (customers || []).reduce((acc, c) => acc + (parseInt(c.points) || 0), 0);

        const tableRows = (customers || []).map(c => {
            const isReady = (parseInt(c.points) || 0) >= REWARD_THRESHOLD;
            const safePrenom = (c.prenom || '').replace(/'/g, "\\'");
            const safeNom = (c.nom || '').replace(/'/g, "\\'");
            const customerId = c.id;

            return `
                <tr data-id="${customerId}" class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="p-4">
                        <div style="font-weight: 800; color:#0f172a">${c.prenom} ${c.nom}</div>
                        <div style="font-size:10px; color:#64748b;">ID: ${customerId.substring(0,8)}</div>
                    </td>
                    <td class="p-4 text-sm font-medium text-slate-600">${c.telephone || 'N/A'}</td>
                    <td class="p-4">
                        <span class="points-pill ${isReady ? 'ready' : ''}">
                            <span class="points-val">${c.points}</span> PTS
                        </span>
                    </td>
                    <td class="p-4" style="text-align: right;">
                        <div style="display:flex; justify-content:flex-end; gap:8px; align-items:center;">
                            <button class="action-btn btn-gift" onclick="offrirCadeau('${customerId}')" 
                                    style="display: ${isReady ? 'inline-block' : 'none'}; background:#f59e0b; color:white; border:none; padding:8px; border-radius:10px; cursor:pointer;">
                                <i class="fa-solid fa-gift"></i>
                            </button>
                            <button class="action-btn" onclick="updatePoints('${customerId}', 1)" style="color:#22c55e; background:#f1f5f9; border:none; padding:8px; border-radius:10px; cursor:pointer;"><i class="fa-solid fa-plus"></i></button>
                            <button class="action-btn" onclick="updatePoints('${customerId}', -1)" style="color:#f59e0b; background:#f1f5f9; border:none; padding:8px; border-radius:10px; cursor:pointer;"><i class="fa-solid fa-minus"></i></button>
                            <div style="width:1px; background:#e2e8f0; margin:0 4px; height:20px;"></div>
                            <a href="/my-card/${customerId}" target="_blank" 
                               style="display: inline-flex !important; align-items: center; justify-content: center; width: 34px; height: 34px; background: #0f172a; color: white; border-radius: 10px; text-decoration: none; font-size: 14px;">
                                <i class="fa-solid fa-eye"></i>
                            </a>
                            <button class="action-btn" onclick="openEditModal('${customerId}', '${safePrenom}', '${safeNom}', '${c.telephone}', '${c.email}')" 
                                    style="color:#0f172a; background:#f1f5f9; border:none; padding:8px; border-radius:10px; cursor:pointer;">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="action-btn" onclick="deleteCustomer('${customerId}')" 
                                    style="color:#ef4444; background:#f1f5f9; border:none; padding:8px; border-radius:10px; cursor:pointer;">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
        }).join('');

        res.send(render('dashboard-template.html', { 
            business_id: b.id, 
            nom: b.nom, 
            logo_url: b.config_design.logo_url, 
            slug: b.slug, 
            listClients: tableRows, 
            threshold: REWARD_THRESHOLD, 
            auth_token: authToken,
            nbClients: totalClients, 
            sommePoints: pointsTotal,
            email: b.gestionnaire_email,
            telephone: b.gestionnaire_tel,
            supabase_url: process.env.SUPABASE_URL,
            supabase_key: process.env.SUPABASE_KEY
        }));
    } catch (e) { res.status(500).send("Erreur serveur"); }
};

// --- 2. AUTHENTIFICATION ---
exports.getLogin = async (req, res) => {
    try {
        const { slug } = req.params;
        const { data: b } = await supabase.from('business').select('*').eq('slug', slug).single();
        if (!b) return res.status(404).send("Commerce non trouvé");

        res.send(render('login-dashboard.html', { 
            nom: b.nom, logo_url: b.config_design.logo_url, slug: b.slug, 
            supabase_url: process.env.SUPABASE_URL, supabase_key: process.env.SUPABASE_KEY 
        }));
    } catch (err) { res.status(500).send("Erreur"); }
};

exports.logout = async (req, res) => {
    const { slug } = req.params;
    await supabase.auth.signOut(); 
    res.redirect(`/dashboard/login/${slug}`);
};

// --- 3. SYSTÈME DE SCAN ---
exports.getPrepareScan = async (req, res) => {
    try {
        const { slug } = req.params;
        const token = req.query.auth;
        const { data: b } = await supabase.from('business').select('*').eq('slug', slug).single();
        if (!b) return res.status(404).send("Commerce non trouvé");

        res.send(render('prepare-scan.html', { nom: b.nom, logo_url: b.config_design.logo_url, slug: b.slug, auth_token: token }));
    } catch (err) { res.status(500).send("Erreur"); }
};

exports.getScannerPage = async (req, res) => {
    try {
        const { slug } = req.params;
        const token = req.query.auth;
        const { data: b } = await supabase.from('business').select('*').eq('slug', slug).single();
        if (!b) return res.status(404).send("Commerce inconnu");

        res.send(render('scanner.html', { nom: b.nom, logo_url: b.config_design.logo_url, slug: b.slug, auth_token: token }));
    } catch (err) { res.status(500).send("Erreur"); }
};

// --- 4. API ACTIONS ---
exports.handleScan = async (req, res) => {
    try {
        const identifierFromScanner = req.params.id; // Le slug
        const { customer_id } = req.body; 
        if (!customer_id) return res.status(400).json({ success: false, message: "ID client manquant" });

        const { data: business } = await supabase.from('business').select('id').eq('slug', identifierFromScanner).single();
        if (!business) return res.status(404).json({ success: false, message: "Commerce introuvable." });
        
        const { data: customer, error: fetchError } = await supabase.from('customers').select('id, business_id, points').eq('id', customer_id).single();
        if (fetchError || !customer) return res.status(404).json({ success: false, message: "Carte invalide." });

        if (String(customer.business_id) !== String(business.id)) {
            return res.status(403).json({ success: false, message: "Carte invalide ici !" });
        }

        const nouveauxPoints = (customer.points || 0) + 1;
        await supabase.from('customers').update({ points: nouveauxPoints }).eq('id', customer_id);
        await supabase.from('scans').insert([{ business_id: business.id, customer_id: customer_id, points_ajoutes: 1 }]);

        res.json({ success: true, message: "Point ajouté !", total_points: nouveauxPoints });
    } catch (err) { res.status(500).json({ success: false, message: "Erreur technique" }); }
};

exports.resetPoints = async (req, res) => {
    try {
        const { data: customer } = await supabase.from('customers').select('business(slug)').eq('id', req.params.id).single();
        await supabase.from('customers').update({ points: 0 }).eq('id', req.params.id);
        res.redirect(`/dashboard/${customer.business.slug}`);
    } catch (err) { res.status(500).send("Erreur"); }
};

exports.updatePassword = async (req, res) => {
    try {
        const { slug } = req.params;
        const { old_password, new_password } = req.body;
        const { data: b } = await supabase.from('business').select('*').eq('slug', slug).single();
        
        const { data: authTest, error: authError } = await supabase.auth.signInWithPassword({
            email: b.gestionnaire_email, password: old_password.trim()
        });

        if (authError) return res.status(401).json({ success: false, message: "Ancien mot de passe incorrect." });

        await supabase.auth.admin.updateUserById(authTest.user.id, { password: new_password.trim() });
        await supabase.from('business').update({ password: new_password.trim() }).eq('slug', slug);

        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: "Erreur technique" }); }
};

// Mise à jour des points (+ ou -)
exports.updatePoints = async (req, res) => {
    try {
        const { id } = req.params;
        const { increment } = req.body; // Reçoit 1 ou -1

        const { data: customer, error: fetchError } = await supabase
            .from('customers')
            .select('points')
            .eq('id', id)
            .single();

        if (fetchError || !customer) return res.status(404).json({ success: false });

        const nouveauxPoints = Math.max(0, (customer.points || 0) + increment);
        
        const { error: updError } = await supabase
            .from('customers')
            .update({ points: nouveauxPoints })
            .eq('id', id);

        if (updError) throw updError;
        res.json({ success: true, points: nouveauxPoints });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
// Suppression d'un client
exports.deleteCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('customers').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};
// Modification des informations
exports.updateCustomerInfo = async (req, res) => {
    try {
        const { id } = req.params;
        const { prenom, nom, email, telephone } = req.body;

        const { error } = await supabase
            .from('customers')
            .update({ prenom, nom, email, telephone })
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};