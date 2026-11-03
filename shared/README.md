# Cœur de la réservation

Les règles qui décident quels créneaux existent, qui peut réserver quoi, et combien coûte l'accompagnement. **Aucune dépendance, aucun accès à AWS** : c'est du TypeScript que Node 22 exécute directement, ce qui permet de tout tester en local et dans le pipeline.

L'API (Lambda), l'administration et la page de réservation s'appuient sur ce dossier : une règle s'écrit ici, une seule fois.

## Les règles, et d'où elles viennent

| Règle | Valeur | Décision de l'équipe |
| --- | --- | --- |
| Durée d'un échange | 30 minutes | Réservation |
| Pause entre deux échanges | 15 minutes | D5 |
| Délai minimum avant un créneau | 12 heures | D3 |
| Horizon de réservation | 3 semaines | D4 |
| Fuseau de l'agenda | Europe/Paris, heure d'été comprise | |
| Validité du lien d'annulation | jusqu'à 24 h après le début du créneau | |
| Réservations actives par adresse e-mail | 1 | **[À VALIDER]** : évite qu'une personne accapare les créneaux |
| Prix | 50 € puis 15 % du premier salaire brut mensuel, plafonné à 350 € au total | Prix |

Les créneaux se génèrent à partir de règles par accompagnant (« le mardi de 18 h à 21 h »), moins les absences. Leur identifiant se déduit de l'accompagnant et de l'heure : régénérer deux fois le même créneau ne crée jamais de doublon, et ne touche jamais à un créneau déjà réservé ou fermé.

## Lancer les tests

```powershell
npm test
```

Les tests couvrent les changements d'heure, la double réservation simultanée, l'expiration et la falsification des liens, le report atomique, et la correspondance du prix avec le simulateur de la page. Chaque règle de ce tableau a été cassée volontairement pour vérifier qu'un test échoue.

## Ce qui n'est pas encore là

- L'implémentation DynamoDB du stockage (`Stockage` dans `src/stockage.mts`) : elle utilisera des écritures conditionnelles et des transactions.
- Les gestionnaires de l'API, l'envoi des e-mails et les rappels.
- La vérification du jeton anti-robot : elle se fait côté API, auprès de Cloudflare.
