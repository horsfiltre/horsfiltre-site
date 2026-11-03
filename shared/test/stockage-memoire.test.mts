import { StockageMemoire } from '../src/stockage.mts';
import { definirContrat } from './contrat-stockage.mts';

// L'implémentation en mémoire doit satisfaire le contrat : c'est ce qui valide les tests eux-mêmes,
// avant qu'ils ne servent à contrôler DynamoDB.
definirContrat({ nom: 'mémoire', creer: async () => new StockageMemoire() });
