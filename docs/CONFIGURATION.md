# Configuration initiale

À faire une seule fois, dans cet ordre.

## 1. Organisation GitHub

1. Créer une organisation gratuite `horsfiltre` (ou un nom proche, selon disponibilité).
2. Paramètres de l'organisation → *Authentication security* → **exiger la double authentification** pour tous les membres.
3. Inviter chaque associé avec son propre compte. Aucun compte partagé.

## 2. Dépôt

1. Créer le dépôt **public** `horsfiltre-site` dans l'organisation, **vide** (sans README ni licence).
2. Pousser ce code (voir la section 6), avant d'activer les règles de protection.

## 3. Sécurité du dépôt

*Settings → Code security* :

- Dependabot alerts : activé
- Dependabot security updates : activé
- Secret scanning : activé
- Push protection : activé — bloque un envoi contenant un secret, avant qu'il n'atteigne GitHub
- Private vulnerability reporting : activé
- CodeQL analysis → **Default setup**, langages *JavaScript/TypeScript* et *GitHub Actions*. L'analyse des workflows détecte notamment les injections de commandes dans le pipeline.

*Settings → Actions → General* :

- Workflow permissions : **Read repository contents** (lecture seule)
- Décocher « Allow GitHub Actions to create and approve pull requests »
- Fork pull request workflows : exiger une approbation pour tous les contributeurs externes

## 4. Règle de protection de `main`

*Settings → Rules → Rulesets → New branch ruleset*, cible : branche par défaut.

- Restrict deletions
- Block force pushes
- Require linear history
- Require signed commits
- Require a pull request before merging
  - Approbations requises : **1** dès qu'une deuxième personne technique peut relire ; **0** tant que vous êtes seul, sinon vous ne pourrez rien fusionner
  - Dismiss stale approvals when new commits are pushed
  - Require review from Code Owners
- Require status checks to pass : *Détection de secrets*, *Validation HTML et performance*
- Bypass list : **vide**, administrateurs compris

## 5. Cloudflare

1. Créer le projet Pages en mode dépôt direct, depuis votre poste :

   ```bash
   npx wrangler login
   npx wrangler pages project create horsfiltre --production-branch=main
   ```

2. *Mon profil → Jetons d'API → Créer un jeton → Modèle personnalisé* :
   - Permission : **Compte → Cloudflare Pages → Modifier**, rien d'autre
   - Ressources du compte : votre compte uniquement
   - Expiration : 6 mois, à renouveler
3. Noter l'**ID de compte**, visible dans la barre latérale du tableau de bord.

## 6. Environnements GitHub

*Settings → Environments* :

**production**
- Deployment branches : **main** uniquement
- Required reviewers : vous-même. Chaque mise en production attend votre clic « Approve ». Ne cochez **pas** « Prevent self-review » tant que vous êtes seul, sinon personne ne pourra approuver.
- Secrets : `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

**preview**
- Deployment branches : toutes
- Secrets : les mêmes

Les secrets sont rattachés aux environnements, pas au dépôt : seul le job de déploiement y a accès.

## 7. Premier envoi

```bash
git init -b main
git add .
git commit -S -m "chore: initialisation du dépôt"
git remote add origin git@github.com:horsfiltre/horsfiltre-site.git
git push -u origin main
```

Puis activer la règle de protection de la section 4.

## 8. Signature des commits (SSH, une fois par poste)

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
```

Ajouter ensuite la même clé publique dans GitHub → *Settings → SSH and GPG keys*, en tant que **Signing key**.

## 9. Détection locale (recommandé)

Installer gitleaks sur le poste (`winget install gitleaks`) pour vérifier avant chaque envoi :

```bash
gitleaks git . --redact
```

## 10. HSTS progressif

Le HSTS oblige les navigateurs à n'utiliser que HTTPS pour le domaine. Une erreur est difficile à rattraper, surtout avec `preload`, qui inscrit le domaine dans les navigateurs eux-mêmes. On l'active donc par paliers, dans Cloudflare (*SSL/TLS → Certificats Edge → HSTS*) plutôt que dans `_headers`, pour couvrir toute la zone.

| Étape | Réglage | Quand |
| --- | --- | --- |
| 1 | `max-age=86400`, sans `includeSubDomains`, sans `preload` | Après une semaine de fonctionnement stable |
| 2 | `max-age=2592000` (30 jours) | Après un mois sans incident |
| 3 | `max-age=31536000`, `includeSubDomains` | Quand tous les sous-domaines prévus servent du HTTPS |
| 4 | `preload` et inscription sur hstspreload.org | Seulement si l'on accepte que ce soit quasi irréversible |
