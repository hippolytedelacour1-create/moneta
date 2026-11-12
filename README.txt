MONETA - NETLIFY
Deployer le CONTENU de ce dossier (index.html, app/, _redirects) a la racine du site Netlify.
Verifier https://votre-site.netlify.app/app/ apres deploiement.

V2 : lire AUDIT.md pour le diagnostic, la compatibilité et les réglages Git/Netlify.
Tests (Node 22+) : node --test tests/budget.test.cjs
Le fichier netlify.toml configure les tests et le dossier publié.

Suivi quotidien : docs/EVOLUTIONS.md
Préparation des comptes : docs/COMPTES-ET-SYNCHRONISATION.md
Scénario de test utilisateur : docs/TEST-UTILISATEURS.md

Comptes : npm ci puis npm run build avant de servir le dépôt localement.
Le SDK Supabase est regroupé au build ; aucun framework n'a été ajouté.
Les inscriptions publiques restent fermées en attente des réglages e-mail.
