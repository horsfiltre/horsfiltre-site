// Rejoue une opération qui peut échouer pour une raison passagère, un nombre limité de fois.
// Sert UNIQUEMENT au démarrage de Chrome : une mesure qui dépasse un seuil n'est jamais rejouée, car un second
// passage vert masquerait un défaut de marge.
export async function avecReprises(operation, options = {}) {
  const { essais = 3, pauseMs = 2000, surEchec = () => {}, pause = (ms) => new Promise((ok) => setTimeout(ok, ms)) } = options;
  for (let essai = 1; ; essai++) {
    try {
      return await operation(essai);
    } catch (erreur) {
      await surEchec(erreur, essai);
      if (essai >= essais) throw erreur;
      await pause(pauseMs * essai);
    }
  }
}
