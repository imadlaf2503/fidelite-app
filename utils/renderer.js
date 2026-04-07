const fs = require('fs');
const path = require('path');

function render(viewName, variables = {}) {
    // Note le '../' car on est dans le dossier /utils maintenant
    const filePath = path.join(__dirname, '../views', viewName);
    if (!fs.existsSync(filePath)) return `Erreur : ${viewName} introuvable.`;
    
    let template = fs.readFileSync(filePath, 'utf8');
    
    // Ton système de remplacement
    for (let i = 0; i < 2; i++) {
        Object.keys(variables).forEach(key => {
            const value = variables[key] !== undefined ? variables[key] : '';
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            template = template.replace(regex, value);
        });
    }
    return template;
}

module.exports = render;