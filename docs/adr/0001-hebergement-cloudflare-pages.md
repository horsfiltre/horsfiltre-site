# ADR-0001 — Héberger le site public sur Cloudflare Pages

Statut : acceptée
Date : 2026-10-26

## Contexte

Le site public est un ensemble de fichiers statiques. La contrainte du projet est un coût d'infrastructure nul, sans compromis sur la sécurité ni la performance, et l'usage est commercial.

## Options envisagées

1. **Hébergement mutualisé OVH** : payant au renouvellement, sans réseau de diffusion mondial.
2. **Vercel, offre gratuite** : interdite pour un usage commercial.
3. **Cloudflare Pages, offre gratuite** : usage commercial autorisé, HTTPS automatique, réseau mondial, pare-feu inclus.

## Décision

Cloudflare Pages, avec la zone DNS gérée par Cloudflare. Le domaine reste enregistré chez OVH, les e-mails restent sur Zimbra (OVH).

## Conséquences

- Coût nul, performance et protection d'un réseau mondial.
- Toute modification e-mail faite chez OVH doit être recopiée dans la zone Cloudflare : OVH ne gère plus la zone.
- Le déploiement passe par GitHub Actions (mode « dépôt direct »), pas par l'intégration Git de Cloudflare : les deux sont exclusifs.

## Réexamen

Si les conditions de l'offre gratuite de Cloudflare changent, ou si un besoin dépasse ses limites.
