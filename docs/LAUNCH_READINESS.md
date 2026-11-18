# Moneta — préparation du lancement

État vérifié le 18 novembre 2026. Le Checkout réel est fermé. Le webhook Stripe Live est désactivé. La vitrine et le budget gratuit sont accessibles, et les inscriptions publiques restent fermées.

## Vérifications effectuées

- **Stripe test et Supabase déployés.** Un paiement par Checkout de 4,99 € en mode test a créé un abonnement mensuel le 18 novembre. Le webhook signé a activé Plus. Stripe a ensuite programmé une résiliation en fin de période ; Moneta a enregistré la résiliation et maintient Plus jusqu’au 18 décembre 2026 à 11 h 47 (Paris). La révocation après annulation est couverte par les tests de base. La fin de période de cet abonnement reste à observer sur les services déployés.
- **Configuration Live.** Le tarif de 4,99 EUR par mois est actif. Le portail Live est configuré pour une résiliation en fin de période. Le contrôle HTTPS reconnaît la forme de la clé et du secret de signature, rejette les requêtes anonymes de statut et les webhooks sans signature et confirme que le Checkout est fermé. Le contrôle HTTPS ne valide pas les droits de la clé auprès de Stripe. Le webhook Live désactivé ne livre aucun événement au backend.
- **Isolation.** Les tables de facturation Live et test sont séparées. Moneta ne débloque Plus qu’après lecture de l’état de l’abonnement sur le serveur. Le navigateur cible toujours le mode test.
- **Publication Netlify.** Le build produit le site dans `dist/`. La CI sert ce répertoire pendant les essais navigateur. Les sources backend, migrations, tests et brouillons internes sont hors du périmètre publié.

## Avant l’ouverture publique

1. **Identité de l’éditeur et support.** Obtenir les coordonnées professionnelles à publier et finaliser les mentions légales, l’information sur les données personnelles et les conditions de vente. Faire valider le régime de TVA, la facture, les modalités de résiliation et de rétractation, le remboursement et, si applicable, la médiation. Voir [brouillons et données à compléter](PUBLICATION.md).
2. **Inscription et récupération.** Configurer le SMTP et les URLs de redirection Supabase vers l’URL publique HTTPS. Installer les modèles d’e-mails versionnés. Vérifier en conditions réelles l’inscription, le lien de confirmation, la connexion et la réinitialisation sur une adresse de test contrôlée. Vérifier la protection contre les mots de passe compromis et les limites d’envoi avant d’ouvrir l’inscription. Voir [Comptes et synchronisation](COMPTES-ET-SYNCHRONISATION.md).
3. **Données et support.** Tester l’export de budget et la suppression du budget distant. Traiter une demande de suppression de compte sur un compte de test, avec la vérification de l’identité et de la fin du renouvellement. Documenter la conservation légale des factures et le traitement des copies locales.
4. **Déploiement.** Vérifier les deux workflows GitHub et les pages du déploiement Netlify. Confirmer que la vitrine, le compte, le retour Stripe et les liens publics fonctionnent sur mobile. Vérifier que les brouillons et fichiers backend sont inaccessibles sur le domaine public.
5. **Essai Live limité à un compte.** Après validation explicite d’un essai payant et des règles de vente, déployer la fonction Live avec la limitation côté serveur, puis configurer `MONETA_LIVE_CHECKOUT_ALLOWED_USER_ID` avec l’UUID Supabase du compte pilote. Vérifier que le contrôle HTTPS indique `checkout_restricted: true` et que le Checkout est fermé avant l’essai. Activer le webhook Live avant l’essai. Pour tester le parcours dans l’interface, livrer temporairement le client en mode Live avec les inscriptions fermées et la limitation serveur en place. Après ouverture du Checkout au pilote, vérifier en premier le refus côté serveur pour un second utilisateur. Vérifier l’abonnement à 4,99 €, la facture, l’accès Plus après le paiement, le portail et la résiliation. La simulation et l’accès doivent suivre l’état de l’abonnement, y compris après un échec de paiement.
6. **Ouverture.** Garder la limitation et le Checkout fermé hors de l’essai jusqu’à validation de toutes les étapes. Après validation, retirer la limitation, passer le client en mode Live et ouvrir les inscriptions et le Checkout. En cas d’incident, désactiver les nouvelles souscriptions avec `MONETA_LIVE_CHECKOUT_ENABLED` et conserver la livraison du webhook et l’accès au portail pour les abonnés existants.

## Accès

- [Vitrine Netlify](https://inquisitive-sable-0a6180.netlify.app/)
- [Application Moneta](https://inquisitive-sable-0a6180.netlify.app/app/)
- [GitHub Actions](https://github.com/hippolytedelacour1-create/moneta/actions)
- [Supabase Moneta](https://supabase.com/dashboard/project/ypdvqatkqzvzyrggiseh)
- [Stripe](https://dashboard.stripe.com/)
