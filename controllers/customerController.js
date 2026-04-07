const supabase = require('../config/supabase');
const render = require('../utils/renderer');

// --- 1. AFFICHER LA CARTE DE FIDÉLITÉ ---
exports.getCard = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Récupérer le client et son business
        const { data: c, error } = await supabase
            .from('customers')
            .select('*, business(*)')
            .eq('id', id)
            .single();

        if (error || !c) return res.status(404).send("Carte introuvable");

        // 2. Générer l'URL du QR Code (pointe vers sa propre carte)
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://fidelite-app-n2cz.onrender.com/my-card/${c.id}`;

        // 3. Récupérer le design HTML/CSS depuis la base de données
        let htmlStudio = c.business.config_design.card_html || "";
        let cssStudio = c.business.config_design.card_css || "";

        // 4. LE REMPLACEMENT CRUCIAL (Regex /g pour remplacer partout)
        htmlStudio = htmlStudio
            .replace(/{{prenom}}/g, c.prenom || "")
            .replace(/{{nom_client}}/g, c.nom || "")
            .replace(/{{qr_client}}/g, qrCodeUrl)
            // On garde la classe pts-value pour l'animation temps réel plus tard
            .replace(/{{points}}/g, `<span class="pts-value">${c.points}</span>`);

        // 5. Envoi au template my-card.html
        res.send(render('my-card.html', { 
            customer_id: c.id,
            nom: c.business.nom, // Pour le Splash Screen
            logo_url: c.business.config_design.logo_url, // Pour le Splash Screen
            CONTENU_STUDIO: htmlStudio + cssStudio, // On injecte tout le bloc
            threshold: c.business.points_thresholds || 10,
            supabase_url: process.env.SUPABASE_URL,
            supabase_key: process.env.SUPABASE_KEY
        }));

    } catch (err) {
        res.status(500).send("Erreur de rendu de la carte");
    }
};

// --- 2. AFFICHER LE FORMULAIRE D'INSCRIPTION ---
exports.getSignupForm = async (req, res) => {
    try {
        const { slug } = req.params;
        const { data: b } = await supabase.from('business').select('*').eq('slug', slug).single();
        
        if (!b) return res.status(404).send("Commerce non trouvé");

        res.send(render('signup-customer.html', {
            nom: b.nom,
            slug: b.slug,
            logo_url: b.config_design.logo_url,
            business_id: b.id,
            color: b.config_design.primary_color || '#000000'
        }));
    } catch (err) {
        res.status(500).send("Erreur");
    }
};

exports.getManifest = async (req, res) => {
    try {
        const customerId = req.query.id;
        if (!customerId) return res.status(400).send("ID manquant");

        // Récupérer le client et les infos du commerce (logo, nom)
        const { data: customer, error } = await supabase
            .from('customers')
            .select('*, business(*)')
            .eq('id', customerId)
            .single();

        if (error || !customer) return res.status(404).send("Non trouvé");

        // On construit le manifest
        const manifest = {
            "short_name": customer.business.nom,
            "name": `Fidélité ${customer.business.nom}`,
            "icons": [
                {
                    "src": customer.business.config_design.logo_url,
                    "sizes": "192x192",
                    "type": "image/png",
                    "purpose": "any maskable"
                },
                {
                    "src": customer.business.config_design.logo_url,
                    "sizes": "512x512",
                    "type": "image/png"
                }
            ],
            "start_url": `/my-card/${customer.id}`,
            "background_color": "#000000",
            "theme_color": "#000000",
            "display": "standalone",
            "orientation": "portrait"
        };

        res.json(manifest);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};