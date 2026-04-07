const supabase = require('../config/supabase');

const authMiddleware = async (req, res, next) => {
    // 1. Récupération du token (Query ou Header)
    const token = req.query.auth || req.headers.authorization?.split(' ')[1];
    
    // 2. Récupération du slug (on teste 'slug' puis 'id' car tes routes varient)
    const slug = req.params.slug || req.params.id;
    
    const ADMIN_EMAIL = process.env.PROJECT_EMAIL?.toLowerCase().trim();

    // Si pas de token, redirection vers login (pour les pages) ou 401 (pour l'API)
    if (!token) {
        if (req.path.includes('/api/')) return res.status(401).json({ error: "Token manquant" });
        return res.redirect(`/dashboard/login/${slug}`);
    }

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            if (req.path.includes('/api/')) return res.status(401).json({ error: "Session expirée" });
            return res.redirect(`/dashboard/login/${slug}`);
        }

        const userEmail = user.email.toLowerCase().trim();

        // --- A. AUTORISATION MASTER ADMIN ---
        if (userEmail === ADMIN_EMAIL) return next();

        // --- B. AUTORISATION COMMERÇANT ---
        if (!slug) return res.status(400).send("Identifiant du commerce manquant dans la requête");

        const { data: business, error: busError } = await supabase
            .from('business')
            .select('id, gestionnaire_email')
            .eq('slug', slug)
            .single();

        if (business && business.gestionnaire_email?.toLowerCase().trim() === userEmail) {
            // On attache le business_id à la requête pour l'utiliser plus tard si besoin
            req.businessId = business.id;
            return next();
        }

        console.log(`[AUTH] Accès refusé pour ${userEmail} sur le commerce ${slug}`);
        return res.status(403).send("Accès refusé : Ce n'est pas votre commerce.");
        
    } catch (err) {
        console.error("Erreur Middleware Auth:", err);
        res.status(500).send("Erreur de sécurité");
    }
};

module.exports = authMiddleware;