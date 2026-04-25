const supabase = require('../config/supabase');
const render = require('../utils/renderer');

// Fonction utilitaire pour formater les dates proprement
const formatDate = (dateStr) => {
    if (!dateStr) return '<span class="text-slate-300">---</span>';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
};

// --- 1. INVENTAIRE COMPLET ---
exports.getInventory = async (req, res) => {
    try {
        const token = req.query.auth;
        // On force la minuscule pour éviter les erreurs de frappe dans les variables d'env
        const ADMIN_EMAIL = (process.env.PROJECT_EMAIL || "").toLowerCase();

        // LOG DE DÉBOGAGE 1 : Vérification de la réception du token
        if (!token) {
            console.log("[AUTH CHECK] Aucun token reçu. Redirection vers login.");
            return res.redirect('/admin/login');
        }

        // Vérification de la session auprès de Supabase
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            console.log("[AUTH CHECK] Erreur Supabase ou session invalide:", authError ? authError.message : "Pas d'utilisateur");
            return res.redirect('/admin/login?error=session_expired');
        }

        // LOG DE DÉBOGAGE 2 : Comparaison des emails
        console.log(`[AUTH CHECK] Tentative d'accès : User=${user.email.toLowerCase()} | Attendu=${ADMIN_EMAIL}`);

        if (user.email.toLowerCase() !== ADMIN_EMAIL) {
            console.log("[AUTH CHECK] Accès refusé : L'email ne correspond pas au PROJECT_EMAIL");
            return res.redirect('/admin/login?error=unauthorized');
        }

        // Si on arrive ici, l'admin est authentifié, on récupère les commerces
        const { data: businesses, error: dbError } = await supabase
            .from('business')
            .select('*')
            .order('created_at', { ascending: false });

        if (dbError) {
            console.error("[DB ERROR] Impossible de récupérer les commerces:", dbError.message);
            throw dbError;
        }
        
        const rowsHtml = (businesses || []).map(b => {
            const statusIcon = b.is_active 
                ? `<i class="fa-solid fa-toggle-on text-lg text-indigo-600"></i>` 
                : `<i class="fa-solid fa-toggle-off text-lg text-red-500 animate-pulse"></i>`;
            
            const actuelStatut = (b.statut || '').toLowerCase();
            const isEssai = actuelStatut === 'essai';

            const payBtn = actuelStatut !== 'payé' ? 
                `<button onclick="validerPaiement('${b.id}', '${b.nom.replace(/'/g, "\\'")}')" class="w-8 h-8 flex items-center justify-center rounded-lg bg-green-50 text-green-600 hover:bg-green-600 hover:text-white transition shadow-sm border border-green-100" title="Valider le paiement">
                    <i class="fa-solid fa-check text-xs"></i>
                </button>` : '';

            return `<tr class="hover:bg-slate-50/50 transition border-b border-slate-50">
                <td class="p-6">
                    <div class="flex items-center gap-2">
                        <div class="font-extrabold text-slate-900 text-base">${b.nom}</div>
                        ${!b.is_active ? '<span class="bg-red-100 text-red-600 text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Maintenance</span>' : ''}
                    </div>
                    <div class="flex flex-col">
                        <span class="text-[10px] text-slate-400 font-bold uppercase">${b.gestionnaire_prenom} ${b.gestionnaire_nom}</span>
                        <span class="text-[10px] text-indigo-500 font-black tracking-widest uppercase">ID: ${b.password || '----'}</span>
                    </div>
                </td>
                <td class="p-6 text-xs font-semibold text-slate-600">${b.gestionnaire_email}</td>
                <td class="p-6 text-xs font-bold text-slate-500">${formatDate(b.created_at)}</td>
                <td class="p-6 text-center">
                    <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${actuelStatut === 'payé' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}">
                        ${b.statut || 'En attente'}
                    </span>
                </td>
                <td class="p-6 text-center text-xs font-bold text-slate-600">
                    ${isEssai ? '<span class="text-slate-300">---</span>' : formatDate(b.last_payment)}
                </td>
                <td class="p-6 text-center text-xs font-bold text-slate-600">
                    ${isEssai ? '<span class="text-slate-300">---</span>' : formatDate(b.next_payment)}
                </td>
                <td class="p-6 text-right">
                    <div class="flex justify-end gap-3 items-center">
                        ${payBtn} 
                        <form action="/admin/api/toggle-maintenance/${b.id}?auth=${token}" method="POST" class="inline">
                            <button type="submit" class="w-8 h-8 flex items-center justify-center rounded-lg transition ${b.is_active ? 'bg-slate-100 text-slate-400' : 'bg-red-50 text-red-500'}">
                                ${statusIcon}
                            </button>
                        </form>
                        <a href="/admin/edit/${b.id}?auth=${token}" class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-indigo-600 hover:text-white transition shadow-sm">
                            <i class="fa-solid fa-pen text-xs"></i>
                        </a>
                        <a href="/dashboard/login/${b.slug}" target="_blank" class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-700 transition shadow-sm">
                            <i class="fa-solid fa-eye text-xs"></i>
                        </a>
                        <button onclick="deleteBusiness('${b.id}', '${b.nom.replace(/'/g, "\\'")}')" class="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-600 hover:text-white transition shadow-sm border border-red-100">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        // Calcul des revenus
        let revenuEuro = 0;
        let revenuDZD = 0;
        businesses.forEach(b => {
            if ((b.statut || '').toLowerCase() === 'payé') {
                revenuEuro += (Number(b.prix_mensuel) || 0);
                revenuDZD += (Number(b.prix_dzd) || 0);
            }
        });
        
        const rawJsonData = JSON.stringify(businesses.map(b => ({ id: b.id, nom: b.nom, email: b.gestionnaire_email, statut: b.statut })));

        // Envoi final vers le template
        res.send(render('admin-inventory.html', { 
            listCommerçants: rowsHtml, 
            totalCommerces: businesses.length, 
            revenuTotal: `${revenuEuro}€ / ${revenuDZD} DA`,
            abonnementsActifs: businesses.filter(b => b.is_active).length, 
            rawJsonData: encodeURIComponent(rawJsonData),
            auth_token: token 
        }));

    } catch (err) { 
        console.error("[CRITICAL ERROR] getInventory:", err.message);
        res.status(500).send("Erreur serveur : " + err.message); 
    }
};
// --- 2. FORMULAIRE CRÉATION ---
exports.getCreateForm = (req, res) => {
    res.send(render('super-admin.html', { formTitle: "Nouveau Commerce", formAction: "/admin/api/creer-commerce", submitText: "Déployer le commerce", nom: "", slug: "", g_prenom: "", g_nom: "", g_email: "", g_tel: "", prix: "49", prix_dzd: "2500", couleur: "#6366f1", password: "", points_per_euro: "1", logic_type: "reset", points_thresholds: "10:Café offert, 20:Sandwich offert", card_html: `<div class="card-content">\n  <img src="{{logo_url}}" class="logo">\n  <h2>{{prenom_client}}</h2>\n  <div class="pts">{{points}} PTS</div>\n</div>`, card_css: `.card-view { padding: 20px; text-align: center; }\n.pts { font-size: 40px; font-weight: 900; }` }));
};

// --- 3. LOGIQUE CRÉATION (POST) ---
exports.createBusiness = async (req, res) => {
    try {
        const body = req.body;
        let publicUrl = "";

        // 1. Upload du logo si présent
        if (req.file) {
            const fileName = `${Date.now()}-${body.slug}.${req.file.originalname.split('.').pop()}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('logos')
                .upload(`uploads/${fileName}`, req.file.buffer, { contentType: req.file.mimetype });
            
            if (uploadError) console.error("Erreur Upload:", uploadError);
            publicUrl = supabase.storage.from('logos').getPublicUrl(`uploads/${fileName}`).data.publicUrl;
        }

        // 2. Création de l'utilisateur (Auth)
        // Note: Si ça échoue ici, vérifie que ta clé SUPABASE_KEY est bien la SERVICE_ROLE_KEY
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: body.g_email,
            password: body.password,
            email_confirm: true,
            user_metadata: { business_slug: body.slug }
        });

        if (authError) {
            console.error("Erreur Auth Admin:", authError.message);
            // On continue quand même l'insertion du business ou on renvoie l'erreur
        }

        // 3. Insertion dans la table Business
        const { error: insertError } = await supabase.from('business').insert([{ 
            nom: body.nom, 
            slug: body.slug, 
            gestionnaire_prenom: body.g_prenom, 
            gestionnaire_nom: body.g_nom, 
            gestionnaire_email: body.g_email, 
            gestionnaire_tel: body.g_tel, 
            prix_mensuel: body.prix_mensuel, 
            prix_dzd: body.prix_dzd,
            statut: body.statut, 
            is_active: true, 
            password: body.password, 
            points_per_euro: body.points_per_euro, 
            logic_type: body.logic_type, 
            points_thresholds: body.points_thresholds, 
            config_design: { 
                couleur: body.couleur, 
                logo_url: publicUrl, 
                card_html: body.card_html, 
                card_css: body.card_css 
            } 
        }]);

        if (insertError) {
            throw new Error("Erreur insertion DB: " + insertError.message);
        }

        res.redirect(`/admin/inventory?auth=${req.query.auth || ''}`);
    } catch (err) { 
        console.error("Global Error:", err);
        res.status(500).send("Erreur lors de la création : " + err.message); 
    }
};
// --- 4. LOGS SYSTEME ---
exports.getLogs = async (req, res) => {
    const { data: logs } = await supabase.from('system_logs').select('*').order('created_at', { ascending: false }).limit(50);
    const logsHtml = (logs || []).map(l => `<div class="flex gap-4 p-4 border-b border-slate-100 text-[11px] items-center hover:bg-slate-50 transition"><span class="text-slate-400 font-mono">${new Date(l.created_at).toLocaleString()}</span><span class="font-black ${l.action_type === 'SECURITY' ? 'text-red-500' : 'text-indigo-500'} uppercase w-24">[${l.action_type}]</span><span class="text-slate-700 font-semibold">${l.message}</span></div>`).join('');
    res.send(render('admin-logs.html', { content: logsHtml }));
};

// --- 5. TOGGLE MAINTENANCE ---
exports.toggleMaintenance = async (req, res) => {
    try {
        const { id } = req.params;
        const token = req.query.auth;
        const { data: b } = await supabase.from('business').select('is_active').eq('id', id).single();
        await supabase.from('business').update({ is_active: !b.is_active }).eq('id', id);
        res.redirect(`/admin/inventory?auth=${token}`);
    } catch (err) { res.status(500).send(err.message); }
};

// --- 6. VALIDER PAIEMENT ---
exports.validatePayment = async (req, res) => {
    try {
        const now = new Date();
        const nextMonth = new Date();
        nextMonth.setMonth(now.getMonth() + 1);

        await supabase.from('business').update({ 
            statut: 'payé', 
            is_active: true,
            last_payment: now.toISOString(),
            next_payment: nextMonth.toISOString()
        }).eq('id', req.params.id);

        res.json({ success: true, message: "Abonnement activé !" });
    } catch (err) { res.status(500).json({ success: false }); }
};

// --- 7. AFFICHER LE LOGIN ADMIN ---
exports.getAdminLogin = (req, res) => {
    res.send(render('admin-login.html', { 
        supabase_url: process.env.SUPABASE_URL, 
        supabase_key: process.env.SUPABASE_KEY 
    }));
};

exports.getEditBusiness = async (req, res) => {
    try {
        const { id } = req.params;
        const token = req.query.auth;

        const { data: b, error } = await supabase
            .from('business')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !b) return res.status(404).send("Commerce inconnu");

        const status = (b.statut || '').toLowerCase();

        res.send(render('super-admin.html', {
            g_prenom: b.gestionnaire_prenom,
            g_nom: b.gestionnaire_nom,
            g_email: b.gestionnaire_email,
            g_tel: b.gestionnaire_tel,
            password: b.password,
            prix: b.prix_mensuel,
            prix_dzd: b.prix_dzd, // Transmission du prix DZD
            selected_essai: status === 'essai' ? 'selected' : '',
            selected_paye: status === 'payé' ? 'selected' : '',
            selected_attente: status === 'attente' ? 'selected' : '',
            nom: b.nom,
            slug: b.slug,
            couleur: b.couleur || '#000000',
            logo_url: b.config_design?.logo_url || '',
            slugReadonly: 'readonly',
            points_per_euro: b.points_per_euro || 1,
            points_thresholds: b.points_thresholds,
            selected_reset: b.logic_type === 'reset' ? 'selected' : '',
            selected_paliers: b.logic_type === 'paliers' ? 'selected' : '',
            card_html: b.config_design?.card_html || '',
            card_css: b.config_design?.card_css || '',
            formTitle: "Modifier " + b.nom,
            formAction: `/admin/api/update-business/${b.id}?auth=${token}`,
            submitText: "Mettre à jour le commerce",
            auth_token: token,
            supabase_url: process.env.SUPABASE_URL,
            supabase_key: process.env.SUPABASE_KEY
        }));
    } catch (err) {
        res.status(500).send("Erreur : " + err.message);
    }
};

exports.updateBusiness = async (req, res) => {
    try {
        const { id } = req.params;
        const token = req.query.auth;

        const { 
            nom, g_prenom, g_nom, g_email, g_tel, 
            password, prix_mensuel, prix_dzd, statut, 
            points_per_euro, logic_type, points_thresholds,
            card_html, card_css 
        } = req.body;

        const { error } = await supabase
            .from('business')
            .update({
                nom,
                gestionnaire_prenom: g_prenom,
                gestionnaire_nom: g_nom,
                gestionnaire_email: g_email,
                gestionnaire_tel: g_tel,
                password,
                prix_mensuel,
                prix_dzd, // Mise à jour du prix DZD
                statut,
                points_per_euro,
                logic_type,
                points_thresholds,
                config_design: {
                    logo_url: req.body.logo_url,
                    card_html,
                    card_css
                }
            })
            .eq('id', id);

        if (error) throw error;

        res.redirect(`/admin/inventory?auth=${token}`);

    } catch (err) {
        console.error("Erreur update:", err);
        res.status(500).send("Erreur lors de la mise à jour : " + err.message);
    }
};
// --- 8. SUPPRIMER UN COMMERCE ---
exports.deleteBusiness = async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. Supprimer le commerce dans la table 'business'
        // Note: Si tes tables 'customers' et 'scans' n'ont pas de "ON DELETE CASCADE", 
        // tu devras peut-être les supprimer manuellement avant.
        const { error: dbError } = await supabase
            .from('business')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;

        // 2. Optionnel : Tu peux aussi supprimer l'utilisateur de Supabase Auth ici 
        // si tu as l'ID de l'utilisateur, mais la suppression DB est le plus important.

        res.json({ success: true, message: "Le commerce a été supprimé avec succès." });
    } catch (err) {
        console.error("Erreur suppression:", err.message);
        res.status(500).json({ success: false, message: "Erreur lors de la suppression : " + err.message });
    }
};