# Décisions d'architecture

Chaque choix structurant fait l'objet d'un ADR : contexte, options comparées, décision, conséquences. Une décision acceptée ne se modifie pas : on la remplace par un nouvel ADR qui la cite.

| N° | Titre | Date | Statut |
| --- | --- | --- | --- |
| 0001 | Héberger le site public sur Cloudflare Pages | 26 octobre 2026 | Acceptée |
| 0002 | Rendre public le dépôt du site | 26 octobre 2026 | Acceptée |
| 0003 | Hébergement de la plateforme candidat : Cloudflare devant, AWS derrière | 27 octobre 2026 | Acceptée — résumé dans `0003-hebergement-plateforme.md` |
| 0004 | Organisation du dépôt et stack de l'étape 1 | 2 novembre 2026 | Acceptée le 3 novembre 2026 |
| 0005 | Authentification de l'administration au 17 novembre | 2 novembre 2026 | Acceptée le 3 novembre 2026 |
| 0006 | Session et connexion des Coulisses avec Cognito | lot 7 | À rédiger |
| 0007 | Page d'accueil : code externalisé, polices auto-hébergées, CSP stricte | 31 octobre 2026 | Acceptée, dans la pull request n° 2 sous le numéro 0003 : renumérotée au lot 0 |

Le numéro 0007 de la page d'accueil n'est pas chronologique : il évite de renuméroter les ADR 0004 à 0006, déjà cités par le prompt maître.
