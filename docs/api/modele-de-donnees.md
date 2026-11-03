# Modèle de données de la réservation

Extension du chapitre 8 du document d'architecture v1.0 (table unique), pour le premier échange réservé par un **visiteur** : ni compte, ni candidature. Les conventions de clés sont celles du document ; on y ajoute les entités de la réservation et trois index.

## Entités

| Entité | PK | SK | Index |
| --- | --- | --- | --- |
| Accompagnant | `ACCOMP#{id}` | `PROFIL` | |
| Règle de disponibilité | `ACCOMP#{id}` | `REGLE#{id}` | |
| Absence | `ACCOMP#{id}` | `ABSENCE#{début ISO}#{id}` | |
| Créneau | `ACCOMP#{id}` | `CRENEAU#{début ISO}` | GSI2, GSI5 |
| Réservation | `RESA#{id}` | `META` | GSI2, GSI3 (si active) |

Les dates sont des instants ISO 8601 en UTC, qui se trient correctement. Les identifiants de créneau, de règle et de réservation ont 26 caractères (alphabet de Crockford), comme dans le contrat d'API (`docs/api/reservations.openapi.yaml`).

## Index

| Index | Clé de partition | Clé de tri | Contenu | Projection |
| --- | --- | --- | --- | --- |
| GSI2 | `CRENEAUX#{statut}`, `RESERVATIONS#{statut}` ou `ACCOMPAGNANTS` | début ISO, ou identifiant pour les accompagnants | créneaux par statut, réservations par statut, liste des accompagnants | tous les attributs |
| GSI3 | `EMAIL` | `{empreinte}#{début ISO}#{id}` | **réservations actives** d'une adresse e-mail | tous les attributs |
| GSI5 | `CRENEAU#{id}`, `REGLE#{id}` ou `ABSENCE#{id}` | | retrouver un créneau, une règle ou une absence par son identifiant | clés seulement |

- **Statuts de créneau** : `libre`, `reserve`, `ferme`. **Statuts de réservation** : `confirmee`, `annulee`.
- **GSI3 est un index « creux »** : une réservation annulée perd ses attributs `GSI3PK` et `GSI3SK` et sort de l'index. Compter les réservations actives d'une adresse revient donc à compter les entrées de l'index qui commencent par son empreinte, sans filtre.
- **L'adresse e-mail n'est jamais dans une clé** : on y met son empreinte (SHA-256 de l'adresse en minuscules). L'adresse elle-même n'est que dans la réservation.
- **GSI5** existe parce que le visiteur ne transmet que l'identifiant du créneau (et l'administration celui d'une règle ou d'une absence), qui est un condensé de l'accompagnant et de l'heure et ne permet pas de retrouver les clés. L'index donne `PK` et `SK` ; la lecture et l'écriture se font ensuite sur la table, de façon cohérente.
- GSI1 et GSI4 du document d'architecture (candidatures et dossiers) viendront avec Les Coulisses.

## Schémas d'accès

| Besoin | Opération |
| --- | --- |
| Créneaux d'une période, pour les visiteurs | 2 requêtes sur GSI2 : `CRENEAUX#libre` puis `CRENEAUX#reserve`, début entre « maintenant + 12 h » et « maintenant + 21 jours » |
| Lire un créneau par son identifiant | requête GSI5 sur `CRENEAU#{id}`, puis lecture cohérente de la table |
| **Réserver** | **une transaction** : le créneau passe de `libre` à `reserve` (condition : il est `libre`), la réservation est écrite (condition : elle n'existe pas) |
| **Annuler** | **une transaction** : la réservation passe à `annulee` et quitte GSI3, le créneau redevient `libre` (condition : il porte bien cette réservation) |
| **Reporter** | **une transaction** à trois éléments : nouveau créneau pris, ancien libéré, réservation mise à jour |
| Réservations actives d'une adresse | requête GSI3 : `EMAIL`, préfixe `{empreinte}#` |
| Générer les créneaux d'une règle | écritures « si absent » : un créneau existant n'est jamais écrasé |
| Réservations à venir (administration) | requête GSI2 sur `RESERVATIONS#confirmee`, début à partir de maintenant |
| Règles et absences d'un accompagnant | requête sur `ACCOMP#{id}` avec le préfixe `REGLE#` ou `ABSENCE#` |
| Liste des accompagnants | requête GSI2 sur `ACCOMPAGNANTS` |
| Lire ou supprimer une règle, une absence | requête GSI5 sur `REGLE#{id}` ou `ABSENCE#{id}`, puis lecture ou suppression sur la table |
| Supprimer un créneau qui n'est plus voulu | suppression **conditionnelle** : refusée si le créneau est réservé |
| Tenir les créneaux à jour | `synchroniserCreneaux` (`shared/src/synchronisation.mts`) : crée les créneaux voulus, retire les libres ou fermés qui ne le sont plus, signale les réservés |

## Conservation et données personnelles

- La réservation porte `expireLe`, en secondes depuis 1970 : DynamoDB la supprime à l'échéance. **[À VALIDER]** : 12 mois après la date de l'échange.
- Les créneaux portent aussi `expireLe` : ils sont supprimés **30 jours** après leur début.
- Les journaux ne contiennent aucune donnée personnelle (adresse, prénom, numéro).
- La table est chiffrée au repos, par la clé gérée par AWS, et sauvegardée en continu (restauration à un instant donné, 35 jours).
- La préproduction n'utilise jamais de vraies données de candidats.
