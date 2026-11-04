# Interface d'administration

Page statique (HTML, CSS et modules JavaScript, **sans compilation**) qui permet à l'équipe de gérer les réservations, les créneaux, les disponibilités et les liens de visioconférence. Elle sera servie par un projet Cloudflare Pages **distinct** du site public, sur `admin.horsfiltre.fr`, derrière Cloudflare Access (ADR-0005).

## Lancer en local

```powershell
npm.cmd run admin:dev
```

Puis ouvrir `http://localhost:8788/`. La page vous renvoie vers la connexion Cognito (mot de passe, puis code de l'application d'authentification) et revient sur la page. Elle parle à l'API de **préproduction** décrite dans `config.json`.

## Ce qui la protège

- **Le jeton ne quitte jamais la mémoire de la page** : ni `localStorage`, ni `sessionStorage`, ni cookie. Seul le secret PKCE, à usage unique, traverse la redirection, dans `sessionStorage`. Actualiser la page ramène donc à la connexion, qui est immédiate tant que la session Cognito est ouverte.
- **Aucun contenu venu d'un candidat n'est jamais interprété comme du HTML.** Tout le DOM est construit avec `createElement` et `textContent` (`js/dom.js`) ; il n'y a aucun `innerHTML`. Un prénom ou un message piégé s'affiche comme du texte.
- **Politique de sécurité stricte** (`_headers`) : aucun script ni style intégré, aucune ressource externe. `connect-src` ne nomme que l'API et la page de connexion Cognito de l'environnement.
- **Un compte hors du groupe `administrateurs`** voit « Accès refusé », et la page n'appelle même pas l'API d'administration.

## Changer d'environnement

`config.json` (adresse de l'API, page de connexion Cognito, identifiant du client) et `_headers` (`connect-src`) doivent changer **ensemble**. Pour la production, retirer aussi les adresses `localhost` du Terraform de la préproduction : elles n'ont rien à faire dans une pile de production.

## Tests

`npm.cmd test` lance les tests des modules qui ne touchent pas au DOM : heures de Paris (comparées jour par jour au calcul de l'API, changements d'heure compris), connexion PKCE et gestion de session, client d'API. Le contrôle HTML (`npm.cmd run lint:html`) couvre aussi cette page.

Le parcours dans un vrai navigateur (connexion, annulation, créneaux, règles, absences, contenu piégé, téléphone, mode sombre, compte refusé) a été vérifié avant livraison avec un faux Cognito et la vraie logique de l'API ; ce parcours n'est pas dans le dépôt.
