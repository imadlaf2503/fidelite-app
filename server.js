const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- IMPORT DES ROUTES ---
const adminRoutes = require('./routes/adminRoutes');
const businessRoutes = require('./routes/businessRoutes');
const customerRoutes = require('./routes/customerRoutes');

// --- ACTIVATION DES ROUTES ---

// 1. Espace Administrateur (Toi)
app.use('/admin', adminRoutes);

// 2. Espace Commerçant (Dashboard, Scanner, Login)
app.use('/dashboard', businessRoutes);

// 3. Espace Client (Carte, Inscription)
app.use('/', customerRoutes);

// --- REDIRECTION RACINE ---
// Si on accède à http://localhost:3000/ on redirige vers l'admin par défaut
app.get('/', (req, res) => {
    res.redirect('/admin');
});

// --- GESTION DES ERREURS ---
app.use((req, res) => {
    res.status(404).send("Page introuvable");
});

app.listen(PORT, () => {
    console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
    console.log(`🚀 Architecture : Admin [/admin], Business [/dashboard], Client [/]`);
});