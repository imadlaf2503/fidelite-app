require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const adminRoutes = require('./routes/adminRoutes');
const businessRoutes = require('./routes/businessRoutes');
const customerRoutes = require('./routes/customerRoutes');
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Utilise bien la clé SERVICE_ROLE pour le serveur
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

// --- NOUVEAU : MIDDLEWARE DE SÉCURITÉ ---
const checkAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: "Non connecté" });

        const token = authHeader.split(' ')[1]; 
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) throw new Error("Session expirée");

        req.user = user; 
        next();
    } catch (e) {
        res.status(401).json({ error: "Accès refusé" });
    }
};

// --- MOTEUR DE RENDU ---
function render(viewName, variables = {}) {
    const filePath = path.join(__dirname, 'views', viewName);
    if (!fs.existsSync(filePath)) return `Erreur : ${viewName} introuvable.`;
    let template = fs.readFileSync(filePath, 'utf8');
    if (variables.card_html) template = template.replace(/{{card_html}}/g, variables.card_html);
    if (variables.card_css) template = template.replace(/{{card_css}}/g, variables.card_css);
    for (let i = 0; i < 2; i++) {
        Object.keys(variables).forEach(key => {
            const value = variables[key] !== undefined ? variables[key] : '';
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            template = template.replace(regex, value);
        });
    }
    return template;
}

// --- SYSTÈME DE LOGS ---
async function logAction(type, message, meta = {}) {
    try {
        await supabase.from('system_logs').insert([{
            action_type: type, message: message, metadata: meta
        }]);
    } catch (e) { console.error("Erreur Log:", e); }
}

// --- ROUTES ADMIN ---
app.use('/admin', adminRoutes);



app.get('/admin/edit/:id', async (req, res) => {
    try {
        const { data: b } = await supabase.from('business').select('*').eq('id', req.params.id).single();
        res.send(render('super-admin.html', { formTitle: `Modifier ${b.nom}`, formAction: `/api/modifier-commerce/${b.id}`, submitText: "Mettre à jour", nom: b.nom, slug: b.slug, g_prenom: b.gestionnaire_prenom, g_nom: b.gestionnaire_nom, g_email: b.gestionnaire_email, g_tel: b.gestionnaire_tel, prix: b.prix_mensuel, password: b.password || "", couleur: b.config_design.couleur, logo_url: b.config_design.logo_url, points_per_euro: b.points_per_euro, logic_type: b.logic_type, points_thresholds: b.points_thresholds, card_html: b.config_design.card_html, card_css: b.config_design.card_css }));
    } catch (err) { res.redirect('/admin/inventory'); }
});



app.post('/api/modifier-commerce/:id', upload.single('logo_file'), async (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body;

        console.log("--- DÉBUT MODIFICATION COMMERCE ---");

        // 1. On récupère les infos actuelles
        const { data: old, error: fetchError } = await supabase.from('business').select('*').eq('id', id).single();
        if (fetchError || !old) return res.status(404).send("Commerce non trouvé");

        // 2. On prépare l'objet de mise à jour (ON NE MET QUE CE QUI EST NÉCESSAIRE)
        let updateData = {
            nom: body.nom,
            prix_mensuel: body.prix_mensuel,
            statut: body.statut,
            points_per_euro: body.points_per_euro,
            logic_type: body.logic_type,
            points_thresholds: body.points_thresholds,
            config_design: {
                ...old.config_design, // On garde les anciennes valeurs par défaut
                card_html: body.card_html,
                card_css: body.card_css
            }
        };

        // On ne met à jour le logo que si un nouveau fichier est envoyé
        if (req.file) {
            const fileName = `${Date.now()}-${id}.${req.file.originalname.split('.').pop()}`;
            await supabase.storage.from('logos').upload(`uploads/${fileName}`, req.file.buffer, { upsert: true });
            updateData.config_design.logo_url = supabase.storage.from('logos').getPublicUrl(`uploads/${fileName}`).data.publicUrl;
        }

        // --- SECTION CRITIQUE : AUTH ---
        // On ne touche à l'Auth QUE si l'utilisateur a changé manuellement l'email ou le password
        // Si les valeurs envoyées sont les mêmes que 'old', on ignore COMPLÈTEMENT Supabase Auth.
        if (body.g_email !== old.gestionnaire_email || (body.password && body.password !== old.password)) {
            console.log("Changement d'identifiants détecté, mise à jour Auth en cours...");
            
            const { data: userList } = await supabase.auth.admin.listUsers();
            const authUser = userList.users.find(u => u.email === old.gestionnaire_email);

            if (authUser) {
                await supabase.auth.admin.updateUserById(authUser.id, {
                    email: body.g_email,
                    password: body.password,
                    email_confirm: true
                });
                // On met à jour l'email et le password dans la table business aussi
                updateData.gestionnaire_email = body.g_email;
                updateData.password = body.password;
            }
        } else {
            console.log("Pas de changement d'identifiants. Session préservée.");
        }

        // 3. Update final de la table business
        const { error: updateError } = await supabase.from('business').update(updateData).eq('id', id);
        
        if (updateError) throw updateError;

        await logAction('UPDATE', `Design/Commerce mis à jour pour : ${body.nom}`);
        
        console.log("--- FIN MODIFICATION : REDIRECTION ---");
        
        // On utilise un redirect explicite
        return res.redirect('/admin/inventory');

    } catch (err) { 
        console.error("ERREUR DANS LA ROUTE :", err);
        res.status(500).send("Erreur : " + err.message); 
    }
});
// --- DASHBOARD COMMERÇANT ---

app.get('/dashboard/:slug/login', async (req, res) => {
    try {
        const { data: b } = await supabase.from('business').select('*').eq('slug', req.params.slug).single();
        if (!b || !b.is_active) return res.status(403).send("Accès impossible.");
        res.send(render('login-dashboard.html', { nom: b.nom, logo_url: b.config_design.logo_url, slug: b.slug, supabase_url: process.env.SUPABASE_URL, supabase_key: process.env.SUPABASE_KEY }));
    } catch (e) { res.status(404).send("Erreur"); }
});

// --- DASHBOARD SÉCURISÉ (ADMIN + COMMERÇANT) ---
// --- DASHBOARD SÉCURISÉ (ADMIN + COMMERÇANT) ---
// --- DASHBOARD SÉCURISÉ (ADMIN + COMMERÇANT) ---
app.get('/dashboard/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const authToken = req.query.auth;
        const ADMIN_EMAIL = process.env.PROJECT_EMAIL.toLowerCase().trim(); // TON EMAIL ADMIN

        // 1. Récupération du commerce par son slug
        const { data: b, error: bError } = await supabase.from('business').select('*').eq('slug', slug).single();
        
        if (bError || !b) {
            console.error(`Commerce introuvable pour le slug : ${slug}`);
            return res.status(404).send("Commerce inconnu");
        }

        // 2. Si pas de token, redirection vers la page de login
        if (!authToken) {
            return res.send(render('login-dashboard.html', { 
                nom: b.nom, logo_url: b.config_design.logo_url, slug: b.slug, 
                supabase_url: process.env.SUPABASE_URL, supabase_key: process.env.SUPABASE_KEY 
            }));
        }

        // 3. Vérification de l'utilisateur via le token
        const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);

        // --- SECTION DE VÉRIFICATION ET DIAGNOSTIC ---
        const userEmail = user?.email?.toLowerCase().trim();
        const managerEmail = b.gestionnaire_email?.toLowerCase().trim();
        const adminEmailClean = ADMIN_EMAIL;

        // Ces logs s'affichent dans ton terminal pour déboguer
        console.log("--- TEST D'ACCÈS DASHBOARD ---");
        console.log(`Slug visité : ${slug}`);
        console.log(`Email connecté (Supabase Auth) : [${userEmail}]`);
        console.log(`Email attendu (Table Business) : [${managerEmail}]`);

        const isOwner = userEmail && managerEmail && userEmail === managerEmail;
        const isAdmin = userEmail === adminEmailClean;

        if (authError || !user || (!isOwner && !isAdmin)) {
            console.error(`ACCÈS REFUSÉ : L'email ${userEmail} n'est ni l'admin, ni le gestionnaire déclaré.`);
            return res.redirect(`/dashboard/${slug}/login?error=unauthorized`);
        }
        // ---------------------------------------------

        // 4. Vérification du statut de paiement
        const estPaye = b.statut && b.statut.toLowerCase() === 'payé';
        
        if (!estPaye && !isAdmin) {
            return res.status(403).send(`
                <div style="font-family: 'Plus Jakarta Sans', sans-serif; text-align:center; padding:100px 20px; background:#f8fafc; min-height:100vh;">
                    <div style="max-width:500px; margin:auto; background:white; padding:40px; border-radius:24px; border:1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
                        <div style="color:#f59e0b; font-size:50px; margin-bottom:20px;"><i class="fa-solid fa-circle-exclamation"></i></div>
                        <h1 style="color:#0f172a; font-weight:900; text-transform:uppercase; margin-bottom:10px;">Accès Restreint</h1>
                        <p style="color:#64748b; font-size:14px; margin-bottom:30px;">
                            Votre abonnement pour <b>${b.nom}</b> est actuellement en attente de paiement ou expiré. 
                        </p>
                        <a href="/dashboard/${slug}/login" style="display:inline-block; background:#6366f1; color:white; padding:12px 25px; border-radius:10px; text-decoration:none; font-weight:bold; font-size:13px;">Retour à la connexion</a>
                    </div>
                </div>
            `);
        }

        // 5. Chargement des clients du commerce
        const { data: customers } = await supabase.from('customers').select('*').eq('business_id', b.id).order('created_at', { ascending: false });
        
        const REWARD_THRESHOLD = parseInt(b.points_thresholds) || 10; 

        // Génération des lignes du tableau
        const tableRows = (customers || []).map(c => {
            const isReady = c.points >= REWARD_THRESHOLD;
            const cleanPrenom = (c.prenom || "").replace(/'/g, "\\'");
            const cleanNom = (c.nom || "").replace(/'/g, "\\'");
            const cleanPhone = (c.telephone || "").replace(/'/g, "\\'");
            const cleanEmail = (c.email || "").replace(/'/g, "\\'");

            return `<tr data-id="${c.id}" class="hover:bg-slate-50 transition">
                <td class="p-4">
                    <div style="font-weight: 800; color:#0f172a">${c.prenom} ${c.nom}</div>
                    <div style="font-size:10px; color:#64748b;">${c.email || ''}</div>
                </td>
                <td class="p-4" style="font-family: monospace;">${c.telephone || 'N/A'}</td>
                <td class="p-4">
                    <span class="points-pill ${isReady ? 'ready' : ''}">
                        <span class="points-val">${c.points}</span> PTS
                    </span>
                </td>
                <td class="p-4" style="text-align: right;">
                    <div style="display:flex; justify-content:flex-end; gap:8px; align-items:center; flex-wrap: wrap;">
                        <button class="action-btn btn-gift" onclick="offrirCadeau('${c.id}')" 
                                style="display: ${isReady ? 'inline-block' : 'none'}; background: #f59e0b; color: white; border:none; padding: 8px 12px; border-radius: 8px; font-weight: 800; font-size: 10px;">
                            <i class="fa-solid fa-gift"></i> OFFRIR
                        </button>
                        <button class="action-btn btn-plus" onclick="updatePoints('${c.id}', 1)"><i class="fa-solid fa-plus"></i></button>
                        <button class="action-btn btn-minus" onclick="updatePoints('${c.id}', -1)"><i class="fa-solid fa-minus"></i></button>
                        <button class="action-btn btn-edit" onclick="openEditModal('${c.id}', '${cleanPrenom}', '${cleanNom}', '${cleanPhone}', '${cleanEmail}')"><i class="fa-solid fa-pen-to-square"></i></button>
                        <a href="/my-card/${c.id}" target="_blank" class="action-btn" style="color: #000000;"><i class="fa-solid fa-eye"></i></a>
                        <button class="action-btn btn-del" onclick="deleteCustomer('${c.id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        // 6. Envoi final du Dashboard
        res.send(render('dashboard-template.html', { 
            business_id: b.id,
            nom: b.nom, 
            logo_url: b.config_design.logo_url, 
            slug: b.slug, 
            listClients: tableRows, 
            threshold: REWARD_THRESHOLD,
            nbClients: (customers || []).length, 
            sommePoints: (customers || []).reduce((acc, c) => acc + (c.points || 0), 0),
            auth_token: authToken,
            supabase_url: process.env.SUPABASE_URL,
            supabase_key: process.env.SUPABASE_KEY
        }));

    } catch (e) { 
        console.error("Erreur critique Dashboard :", e);
        res.status(500).send("Erreur serveur"); 
    }
});

// --- SCANNER SÉCURISÉ (ADMIN + COMMERÇANT) ---
app.get('/scanner/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const authToken = req.query.auth;
        const ADMIN_EMAIL = process.env.PROJECT_EMAIL; 

        const { data: b } = await supabase.from('business').select('*').eq('slug', slug).single();
        if (!b) return res.status(404).send("Commerce inconnu");

        const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);

        const isOwner = user && user.email === b.gestionnaire_email;
        const isAdmin = user && user.email === ADMIN_EMAIL;

        // 1. Sécurité d'identité
        if (authError || !user || (!isOwner && !isAdmin)) {
            return res.status(403).send("Accès refusé : Identité non reconnue.");
        }

        // 2. SÉCURITÉ PAIEMENT (Le blocage ici aussi)
        const estPaye = b.statut && b.statut.toLowerCase() === 'payé';
        if (!estPaye && !isAdmin) {
            return res.status(403).send(`
                <div style="font-family:sans-serif; text-align:center; padding:50px;">
                    <h2 style="color:#ef4444;">Scanner Désactivé</h2>
                    <p>Votre abonnement n'est pas à jour. Impossible de distribuer des points.</p>
                </div>
            `);
        }

        res.send(render('scanner.html', { 
            nom: b.nom, 
            slug: b.slug, 
            logo_url: b.config_design.logo_url,
            auth_token: authToken 
        }));
    } catch (err) { res.status(500).send("Erreur serveur"); }
});

app.post('/api/scan/:id', async (req, res) => {
    try {
        const identifierFromScanner = req.params.id; // Actuellement reçoit le "slug" (ex: "test")
        const { customer_id } = req.body; 

        if (!customer_id) {
            return res.status(400).json({ success: false, message: "ID client manquant" });
        }

        // --- NOUVELLE ÉTAPE : TRADUIRE LE SLUG EN ID RÉEL ---
        const { data: business } = await supabase
            .from('business')
            .select('id')
            .eq('slug', identifierFromScanner) // On cherche le commerce par son slug
            .single();

        if (!business) {
            return res.status(404).json({ success: false, message: "Commerce introuvable." });
        }
        
        const realBusinessId = business.id; // C'est cet ID (UUID/Nombre) qu'on va comparer

        // 1. RECHERCHE DU CLIENT
        const { data: customer, error: fetchError } = await supabase
            .from('customers')
            .select('id, business_id, points')
            .eq('id', customer_id)
            .single();

        if (fetchError || !customer) {
            return res.status(404).json({ success: false, message: "Carte invalide." });
        }

        // 3. LA BARRIÈRE ANTI-FRAUDE (COMPARAISON DES IDS RÉELS)
        // On compare l'ID du client (ex: 12) avec l'ID du commerce trouvé (ex: 12)
        if (String(customer.business_id) !== String(realBusinessId)) {
            console.warn(`FRAUDE : Client ${customer_id} appartient à ${customer.business_id}, pas à ${realBusinessId}`);
            return res.status(403).json({ 
                success: false, 
                message: "Erreur : Cette carte appartient à un autre établissement !" 
            });
        }

        // 4. TOUT EST BON : ON AJOUTE LE POINT
        const nouveauxPoints = (customer.points || 0) + 1;
        const { error: updateError } = await supabase
            .from('customers')
            .update({ points: nouveauxPoints })
            .eq('id', customer_id);

        if (updateError) throw updateError;

        // 5. ENREGISTRER DANS L'HISTORIQUE
        await supabase.from('scans').insert([{ 
            business_id: realBusinessId, 
            customer_id: customer_id, 
            points_ajoutes: 1 
        }]);

        res.json({ success: true, message: "Point ajouté !", total_points: nouveauxPoints });

    } catch (err) {
        console.error("Erreur Scan:", err);
        res.status(500).json({ success: false, message: "Erreur technique" });
    }
});

// --- ROUTES CLIENTS & API POINTS ---
app.get('/signup/:slug', async (req, res) => {
    const { data: b } = await supabase.from('business').select('*').eq('slug', req.params.slug).single();
    if (!b.is_active) return res.send("Inscription temporairement fermée.");
    res.send(render('signup-client.html', { nom: b.nom, slug: b.slug, logo_url: b.config_design.logo_url }));
});

app.post('/api/register-customer/:slug', async (req, res) => {
    const { data: b } = await supabase.from('business').select('id').eq('slug', req.params.slug).single();
    const { data: customer } = await supabase.from('customers').insert([{ business_id: b.id, nom: req.body.nom, prenom: req.body.prenom, email: req.body.email, telephone: req.body.telephone, points: 0 }]).select().single();
    res.redirect(`/my-card/${customer.id}`);
});

app.get('/my-card/:customer_id', async (req, res) => {
    try {
        const { data: c } = await supabase
            .from('customers')
            .select('*, business (*)')
            .eq('id', req.params.customer_id)
            .single();

        if (!c || !c.business.is_active) {
            return res.send("Cette carte est temporairement inactive.");
        }

        const b = c.business;
        const threshold = parseInt(b.points_thresholds) || 10;

        // --- ÉTAPE CRUCIALE : ON PRÉPARE L'INJECTION ---
        // On crée un bloc unique qui contient le style et la structure du studio
        const contenuStudioGenere = `
            <style>${b.config_design.card_css || ''}</style>
            ${b.config_design.card_html || ''}
        `;

        res.send(render('my-card.html', { 
            // Variables de base
            nom: b.nom, 
            logo_url: b.config_design.logo_url, 
            prenom: c.prenom, 
            nom_client: c.nom, 
            points: c.points, 
            customer_id: c.id, 
            threshold: threshold,
            supabase_url: process.env.SUPABASE_URL, 
            supabase_key: process.env.SUPABASE_KEY, 
            qr_client: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${c.id}`,
            
            // --- AJOUT : La variable que my-card.html attend ---
            CONTENU_STUDIO: contenuStudioGenere 
        }));

    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur lors du chargement de la carte.");
    }
});

app.post('/api/add-points/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const { customerId } = req.body;
        const authHeader = req.headers.authorization;
        const ADMIN_EMAIL = process.env.PROJECT_EMAIL; 

        if (!authHeader) return res.status(401).json({ success: false, message: "Non autorisé" });
        const token = authHeader.split(' ')[1];

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        const { data: b } = await supabase.from('business').select('*').eq('slug', slug).single();

        if (authError || !user || !b) return res.status(403).json({ success: false, message: "Session invalide" });

        const isOwner = user.email === b.gestionnaire_email;
        const isAdmin = user.email === ADMIN_EMAIL;

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: "Accès refusé" });
        }

        const { data: c } = await supabase.from('customers').select('*').eq('id', customerId.trim()).single();
        if (!c) return res.status(404).json({ success: false, message: "Client introuvable" });

        // 1. Ajouter le point
        const newTotal = parseInt(c.points || 0) + 1;
        await supabase.from('customers').update({ points: newTotal }).eq('id', c.id);
        
        // --- NOUVEAU : ENREGISTREMENT DANS L'HISTORIQUE DES SCANS (Table scans) ---
        const { error: scanError } = await supabase
            .from('scans')
            .insert([
                { 
                    business_id: b.id, // On utilise l'ID du commerce récupéré plus haut
                    client_nom: `${c.prenom} ${c.nom}`,
                    points_ajoutes: 1 
                }
            ]);
        
        if (scanError) console.error("Erreur insertion table scans:", scanError.message);
        // -------------------------------------------------------------------------

        // Log de maintenance/action (ton code habituel)
        if (isAdmin && !isOwner) {
            await logAction('MAINTENANCE', `Admin (${ADMIN_EMAIL}) a ajouté 1pt à ${c.prenom} (Commerce: ${slug})`);
        } else {
            await logAction('POINTS', `+1 pt pour ${c.prenom} par ${user.email}`);
        }

        res.json({ success: true, customerName: c.prenom, newTotal: newTotal });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Erreur serveur" });
    }
});

app.get('/scanner/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const authToken = req.query.auth; // On récupère le token passé dans l'URL

        const { data: b } = await supabase.from('business').select('*').eq('slug', slug).single();
        if (!b) return res.status(404).send("Commerce inconnu");

        // VÉRIFICATION : Est-ce que la personne qui ouvre le scanner est bien le commerçant ?
        const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);

        if (authError || !user || user.email !== b.gestionnaire_email) {
            return res.status(403).send("Accès refusé : Seul le commerçant peut scanner.");
        }

        res.send(render('scanner.html', { 
            nom: b.nom, 
            slug: b.slug, 
            logo_url: b.config_design.logo_url,
            auth_token: authToken // On repasse le token pour l'API de validation
        }));
    } catch (err) { res.status(500).send("Erreur"); }
});

app.post('/api/reset-points/:id', async (req, res) => {
    try {
        const { data: customer } = await supabase.from('customers').select('business(slug)').eq('id', req.params.id).single();
        await supabase.from('customers').update({ points: 0 }).eq('id', req.params.id);
        res.redirect(`/dashboard/${customer.business.slug}`);
    } catch (err) { res.status(500).send("Erreur"); }
});

app.get('/admin/logs', async (req, res) => {
    const { data: logs } = await supabase.from('system_logs').select('*').order('created_at', { ascending: false }).limit(50);
    const logsHtml = (logs || []).map(l => `<div class="flex gap-4 p-4 border-b border-slate-100 text-[11px] items-center hover:bg-slate-50 transition"><span class="text-slate-400 font-mono">${new Date(l.created_at).toLocaleString()}</span><span class="font-black ${l.action_type === 'SECURITY' ? 'text-red-500' : 'text-indigo-500'} uppercase w-24">[${l.action_type}]</span><span class="text-slate-700 font-semibold">${l.message}</span></div>`).join('');
    res.send(render('admin-logs.html', { content: logsHtml }));
});
// ROUTE POUR CHANGER LE MOT DE PASSE DEPUIS LE DASHBOARD
app.post('/api/update-password/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const { old_password, new_password } = req.body;

        // 1. Récupérer le commerce pour avoir l'email officiel
        const { data: b, error: bError } = await supabase.from('business').select('*').eq('slug', slug).single();
        
        if (bError || !b) {
            return res.status(404).json({ success: false, message: "Commerce introuvable" });
        }

        console.log(`Tentative de changement pour : ${b.gestionnaire_email}`);
        console.log(`Test de l'ancien mot de passe fourni : ${old_password}`);

        // 2. VÉRIFICATION DIRECTE AUPRÈS DE SUPABASE AUTH
        const { data: authTest, error: authError } = await supabase.auth.signInWithPassword({
            email: b.gestionnaire_email,
            password: old_password.trim() // On enlève les espaces cachés au cas où
        });

        if (authError) {
            console.error("Erreur Auth Supabase :", authError.message);
            return res.status(401).json({ 
                success: false, 
                message: "L'ancien mot de passe d'authentification est incorrect (Auth)." 
            });
        }

        // 3. SI OK -> ON RÉCUPÈRE L'ID DE L'USER ET ON CHANGE LE MDP
        const userId = authTest.user.id;
        const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
            password: new_password.trim()
        });

        if (updateError) throw updateError;

        // 4. SYNCHRONISATION DANS LA TABLE BUSINESS
        await supabase.from('business').update({ 
            password: new_password.trim() 
        }).eq('slug', slug);

        console.log("Succès : Mot de passe mis à jour partout.");
        res.json({ success: true });

    } catch (err) {
        console.error("Erreur Critique :", err);
        res.status(500).json({ success: false, message: "Erreur technique lors de la mise à jour" });
    }
});
// --- ROUTE DE SUPPRESSION TOTALE (MAINTENANCE ADMIN UNIQUEMENT) ---
app.post('/api/supprimer-commerce/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const ADMIN_EMAIL = process.env.PROJECT_EMAIL; // <--- TON EMAIL ADMIN ICI
        const authHeader = req.headers.authorization;

        // 1. Sécurité : Seul l'admin peut supprimer un compte SaaS
        if (!authHeader) return res.status(401).json({ success: false, message: "Non autorisé" });
        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user || user.email !== ADMIN_EMAIL) {
            return res.status(403).json({ success: false, message: "Accès refusé : Réservé au Super Admin" });
        }

        // 2. Récupérer les infos du commerce avant suppression
        const { data: b, error: bError } = await supabase.from('business').select('*').eq('id', id).single();
        if (bError || !b) return res.status(404).json({ success: false, message: "Commerce introuvable" });

        console.log(`🧹 Nettoyage complet pour : ${b.nom} (${b.gestionnaire_email})`);

        // 3. SUPPRESSION DANS SUPABASE AUTH
        // On cherche l'ID de l'utilisateur Auth via son email
        const { data: userList } = await supabase.auth.admin.listUsers();
        const authUser = userList.users.find(u => u.email === b.gestionnaire_email);

        if (authUser) {
            const { error: deleteAuthErr } = await supabase.auth.admin.deleteUser(authUser.id);
            if (deleteAuthErr) console.error("Erreur suppression Auth:", deleteAuthErr.message);
        }

        // 4. SUPPRESSION DES DONNÉES (Cascading automatique si tes clés étrangères sont bien réglées)
        // On supprime d'abord les clients liés au business
        await supabase.from('customers').delete().eq('business_id', id);
        
        // On supprime enfin le business
        const { error: deleteBusErr } = await supabase.from('business').delete().eq('id', id);
        if (deleteBusErr) throw deleteBusErr;

        await logAction('MAINTENANCE', `Suppression définitive du commerce : ${b.nom}`, { email: b.gestionnaire_email });

        res.json({ success: true, message: "Commerce et compte Auth supprimés avec succès" });

    } catch (err) {
        console.error("Erreur suppression:", err);
        res.status(500).json({ success: false, message: "Erreur lors de la suppression" });
    }
});
app.get('/dashboard/:slug/logout', async (req, res) => {
    const { slug } = req.params;
    await supabase.auth.signOut(); 
    res.redirect(`/dashboard/${slug}`);
});
app.get('/admin/login', (req, res) => {
    res.send(render('admin-login.html', {
        supabase_url: process.env.SUPABASE_URL,
        supabase_key: process.env.SUPABASE_KEY
    }));
});
// --- VALIDER LE PAIEMENT (ADMIN UNIQUEMENT) ---
// --- VALIDER LE PAIEMENT (MODE SANS LOGIN POUR TEST) ---
app.post('/api/valider-paiement/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // On enlève TOUTE la vérification du authHeader et du token pour le moment
        console.log(`Validation forcée du paiement pour le commerce ID: ${id}`);

        // On met directement à jour dans la base de données
        const { error } = await supabase.from('business')
            .update({ 
                statut: 'payé', 
                is_active: true 
            })
            .eq('id', id);

        if (error) {
            console.error("Erreur Supabase:", error.message);
            return res.status(500).json({ success: false });
        }

        res.json({ success: true, message: "Abonnement activé !" });

    } catch (err) {
        console.error("Erreur crash:", err);
        res.status(500).json({ success: false });
    }
});

app.post('/api/toggle-maintenance/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const token = req.query.auth; // On récupère le badge passé dans l'URL
        const ADMIN_EMAIL = process.env.PROJECT_EMAIL;

        // Vérification d'identité
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user || user.email !== ADMIN_EMAIL) {
            return res.status(403).send("Action non autorisée");
        }

        // On récupère l'état actuel
        const { data: b } = await supabase.from('business').select('is_active').eq('id', id).single();
        
        // On inverse l'état (true -> false ou false -> true)
        const { error } = await supabase.from('business')
            .update({ is_active: !b.is_active })
            .eq('id', id);

        if (error) throw error;
        res.redirect(`/admin/inventory?auth=${token}`); // On repart à l'inventaire avec le badge
    } catch (err) { res.status(500).send(err.message); }
});
app.post('/api/add-customer', async (req, res) => {
    try {
        const { business_id, nom, prenom, telephone, email } = req.body;

        const { data, error } = await supabase
            .from('customers')
            .insert([{ 
                business_id, 
                nom, 
                prenom, 
                telephone, 
                email, 
                points: 0 
            }])
            .select()
            .single();

        if (error) throw error;
        res.json(data); // On renvoie les infos pour que le HTML génère le lien WhatsApp
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/update-points', async (req, res) => {
    try {
        const { customer_id, new_points } = req.body;

        const { error } = await supabase
            .from('customers')
            .update({ points: new_points })
            .eq('id', customer_id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.delete('/api/delete-customer/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('customers')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROUTES ADMIN ---
app.use('/admin', adminRoutes);
app.use('/dashboard', businessRoutes);
app.use('/', customerRoutes);
app.get('/', (req, res) => res.redirect('/admin/inventory'));
app.listen(3000, () => console.log(`🚀 http://localhost:3000`));